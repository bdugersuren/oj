"""
Judge Worker — DMOJ Bridge-тэй холбогдон кодыг шалгах Celery Task

Урсгал:
  POST /submissions  →  DB (PENDING)  →  Celery Task  →  DMOJ Bridge
       →  judge_results хүснэгт  →  Submission.status=AC/WA/TLE/...
       →  Redis Pub/Sub  →  WebSocket  →  Frontend дэлгэц

Phase 1 Mock режим:
  DMOJ Bridge холбогдоогүй үед Test Case тус бүрт Mock дүн буцаадаг.
  ENABLE_JUDGE=True болгосноор бодит DMOJ Bridge-тэй холбогдоно.
"""
import os
import time
import logging
from celery import shared_task

from app.core.celery_app import celery_app
from app.core.config import settings
from app.models.submission import Submission, JudgeResult, SubmissionStatus
from app.models.problem import Problem, TestCase

logger = logging.getLogger(__name__)

ENABLE_JUDGE = os.getenv("ENABLE_JUDGE", "false").lower() == "true"

_engine = None
_Session = None

def _get_sync_session():
    global _engine, _Session
    if _engine is None:
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        sync_url = settings.DATABASE_URL.replace("+asyncpg", "")
        _engine = create_engine(sync_url, pool_size=10, max_overflow=20, pool_pre_ping=True)
        _Session = sessionmaker(bind=_engine)
    return _Session()


# ─── Main Judge Task ──────────────────────────────────────────────────────────

@celery_app.task(
    name="app.workers.judge_worker.execute_submission",
    bind=True,
    max_retries=2,
    default_retry_delay=3,
    queue="judge_queue",
)
def execute_submission(self, submission_id: int):
    """
    Celery Task: submission_id-р тухайн кодыг Judge-д явуулж дүнг DB-д хадгалах.
    """
    from datetime import datetime, timedelta
    from app.models.submission import Submission, JudgeResult, SubmissionStatus
    from app.models.problem import Problem, TestCase
    from app.models.progression import StudentProgress

    # Sync session reuse
    with _get_sync_session() as db:
        # Submission авах
        sub = (
            db.query(Submission)
            .filter(Submission.id == submission_id)
            .with_for_update()
            .first()
        )
        if not sub:
            logger.error(f"Submission {submission_id} олдсонгүй.")
            return
        now = datetime.utcnow()
        if sub.status == SubmissionStatus.RUNNING:
            lease_active = (
                sub.judge_lease_expires_at is not None
                and sub.judge_lease_expires_at > now
            )
            redelivered = bool(
                (getattr(self.request, "delivery_info", None) or {}).get("redelivered")
            )
            if lease_active and redelivered:
                countdown = max(
                    1,
                    int((sub.judge_lease_expires_at - now).total_seconds()) + 1,
                )
                raise self.retry(
                    exc=RuntimeError("Submission is still protected by an active judge lease."),
                    countdown=countdown,
                )
            if lease_active:
                logger.info(
                    "Ignoring concurrent duplicate delivery for submission %s.",
                    submission_id,
                )
                return
            logger.warning("Reclaiming expired judge lease for submission %s.", submission_id)
        elif sub.status != SubmissionStatus.PENDING:
            logger.info(
                "Ignoring duplicate/stale delivery for submission %s in status %s",
                submission_id,
                sub.status.value,
            )
            return

        # RUNNING статус руу шилжих
        sub.status = SubmissionStatus.RUNNING
        sub.judge_attempt = int(sub.judge_attempt or 0) + 1
        sub.judge_started_at = now
        sub.judge_finished_at = None
        sub.judge_lease_expires_at = now + timedelta(seconds=settings.JUDGE_LEASE_SECONDS)
        db.commit()

        try:
            # Problem + TestCase авах
            problem = db.query(Problem).filter(Problem.id == sub.problem_id).first()
            if getattr(sub, 'is_sample_test', False):
                test_cases = (
                    db.query(TestCase)
                    .filter(TestCase.problem_id == sub.problem_id, TestCase.is_sample == True)
                    .order_by(TestCase.order)
                    .all()
                )
            else:
                test_cases = (
                    db.query(TestCase)
                    .filter(TestCase.problem_id == sub.problem_id)
                    .order_by(TestCase.order)
                    .all()
                )

            if getattr(problem, "testcases_zip_key", None):
                _ensure_problem_testcases(problem.code, problem.testcases_zip_key)

            # Дискнээс оролт/гаралтын файлуудыг сэргээж унших (хэрэв DB-д None байвал)
            from app.services.testcase_resolver import resolve_testcase_data_from_disk
            test_cases = resolve_testcase_data_from_disk(
                problem_code=problem.code,
                testcases_zip_key=getattr(problem, "testcases_zip_key", None),
                test_cases=list(test_cases)
            )

            if not test_cases and not getattr(problem, 'testcases_zip_key', None):
                raise ValueError(
                    f"Problem {getattr(problem, 'code', sub.problem_id)} has no judge test cases."
                )

            testcase_count = len(test_cases) if test_cases else 100
            required_lease = max(
                settings.JUDGE_LEASE_SECONDS,
                int(float(problem.time_limit) * testcase_count) + 120,
            )
            sub.judge_lease_expires_at = datetime.utcnow() + timedelta(seconds=required_lease)
            db.commit()

            if not ENABLE_JUDGE:
                raise RuntimeError(
                    "Judge service is disabled; refusing to execute user code in the worker container."
                )

            exec_language, exec_source = _prepare_submission_source(sub)
            if getattr(problem, 'testcases_zip_key', None) and not getattr(sub, 'is_sample_test', False):
                _judge_via_dmoj(db, sub, problem, None, exec_language, exec_source)
            else:
                _judge_via_dmoj(db, sub, problem, test_cases, exec_language, exec_source)

            # XP + Gamification шинэчлэлт
            if sub.status == SubmissionStatus.ACCEPTED:
                _award_xp(db, sub.user_id, problem, submission=sub)

            # Тэмцээний standings шинэчлэлт (оноо авсан бол)
            _update_contest_scoreboard(db, problem.id, sub)
            db.commit()

            # Session хаахаас өмнө утгыг cache хийх
            _final_status = sub.status.value
            _final_score  = sub.score
            _final_time_ms = sub.time_ms
            _final_memory_kb = sub.memory_kb
            final_results = (
                db.query(JudgeResult)
                .filter(JudgeResult.submission_id == sub.id)
                .order_by(JudgeResult.id)
                .all()
            )
            _final_judge_results = [
                {
                    "id": jr.id,
                    "testcase_id": jr.testcase_id,
                    "status": jr.status.value,
                    "time_ms": jr.time_ms,
                    "memory_kb": jr.memory_kb,
                    "output_log": jr.output_log
                }
                for jr in final_results
            ]

        except Exception as exc:
            logger.exception(f"Judge task алдаа гарлаа: {exc}")
            db.rollback()
            final_attempt = self.request.retries >= self.max_retries
            sub.status = (
                SubmissionStatus.SYSTEM_ERROR
                if final_attempt
                else SubmissionStatus.PENDING
            )
            sub.error_log = str(exc)
            sub.judge_lease_expires_at = None
            if final_attempt:
                sub.judge_finished_at = datetime.utcnow()
            db.commit()
            _final_status = sub.status.value
            _final_score  = 0
            _final_time_ms = 0.0
            _final_memory_kb = 0.0
            _final_judge_results = []
            if not final_attempt:
                raise self.retry(exc=exc)

    # Redis Pub/Sub-д мэдэгдэл илгээх (session хаалтаас гадна)
    _publish_result(submission_id, _final_status, _final_score, _final_time_ms, _final_memory_kb, _final_judge_results)



def _prepare_submission_source(sub):
    """Convert supported visual source to a DMOJ runtime language."""
    if sub.language == "flowgorithm":
        from app.services.flowgorithm_transpiler import transpile_fprg_to_python

        return "python3", transpile_fprg_to_python(sub.source_code)
    if sub.language == "scratch":
        from app.services.scratch_transpiler import transpile_scratch_to_python

        return "python3", transpile_scratch_to_python(sub.source_code)
    return sub.language, sub.source_code


# ─── DMOJ Bridge Judge (Phase 2+) ─────────────────────────────────────────────

def _ensure_problem_testcases(problem_code: str, testcases_zip_key: str):
    """
    Ensure the private testcases of the problem are downloaded from MinIO and extracted locally.
    Path: /problems/oj-{problem_code}/
    """
    import zipfile, io, shutil
    from pathlib import Path
    from app.services.storage import storage_client
    
    local_dir = Path("/problems") / f"oj-{problem_code}"
    marker_file = local_dir / "cases_extracted.txt"
    
    if marker_file.exists():
        try:
            stored_key = marker_file.read_text(encoding="utf-8").strip()
            if stored_key == testcases_zip_key:
                return
        except Exception:
            pass
            
    logger.info(f"Downloading testcases for problem {problem_code} (Key: {testcases_zip_key})...")
    
    if not testcases_zip_key.startswith("oj-private-problems/"):
        raise ValueError(f"Invalid testcases zip key: {testcases_zip_key}")
        
    bucket = "oj-private-problems"
    key = testcases_zip_key.replace("oj-private-problems/", "", 1)
    
    try:
        response = storage_client.client.get_object(bucket, key)
        zip_bytes = response.read()
        response.close()
        response.release_conn()
        
        shutil.rmtree(local_dir, ignore_errors=True)
        local_dir.mkdir(parents=True, exist_ok=True)
        
        from app.services.safe_archive import safe_extract_zip

        safe_extract_zip(zip_bytes, local_dir)
            
        # DMOJ-ийн init.yml-ийн "archive: cases.zip" тохиргоонд зориулж zip файлыг бас хадгална
        with open(local_dir / "cases.zip", "wb") as f:
            f.write(zip_bytes)
            
        marker_file.write_text(testcases_zip_key, encoding="utf-8")
        logger.info(f"Successfully extracted testcases and saved cases.zip to {local_dir}")
    except Exception as e:
        logger.exception(f"Failed to download/extract testcases for {problem_code}: {e}")
        shutil.rmtree(local_dir, ignore_errors=True)
        raise e


def _judge_via_dmoj(db, sub, problem, test_cases=None, exec_language=None, exec_source=None):
    """
    DMOJ Bridge-тэй харилцах логик (Phase 2).
    ENABLE_JUDGE=true байх үед ажиллана.
    """
    req_data = {
        "id": sub.id,
        "problem": problem.code,
        "language": exec_language or sub.language,
        "source": exec_source if exec_source is not None else sub.source_code,
        "time_limit": problem.time_limit,
        "memory_limit_mb": problem.memory_limit,
    }
    if test_cases:
        req_data["testcases"] = [
            {"id": tc.id, "input_data": tc.input_data, "output_data": tc.output_data, "points": tc.points}
            for tc in test_cases
        ]
    verdict = _request_dmoj(req_data, f"submission {sub.id}")
    _apply_dmoj_verdict(db, sub, verdict)


def _request_dmoj(req_data: dict, task_label: str) -> dict:
    """Send one bounded request while holding a per-bridge Redis lease."""
    import json
    import socket
    import struct

    import redis

    r_client = redis.Redis.from_url(settings.REDIS_URL)
    hosts = [host.strip() for host in settings.DMOJ_BRIDGE_HOSTS.split(",") if host.strip()]
    if not hosts:
        raise RuntimeError("No DMOJ bridge hosts configured.")
    payload = json.dumps(req_data).encode()
    if len(payload) > 2 * 1024 * 1024:
        raise ValueError("Judge request exceeds 2MB.")
    tc_count = len(req_data.get("testcases") or []) or 100
    request_timeout = max(
        60,
        int(float(req_data.get("time_limit", 1.0)) * tc_count + 30),
    )
    assigned_bridge, bridge_lock = _acquire_bridge_lease(
        r_client,
        hosts,
        wait_seconds=60,
        lease_seconds=request_timeout + 60,
    )
    logger.info("Assigned bridge %s for %s", assigned_bridge, task_label)

    try:
        with socket.create_connection(
            (assigned_bridge, settings.DMOJ_BRIDGE_PORT), timeout=10
        ) as sock:
            sock.sendall(struct.pack("!I", len(payload)) + payload)
            sock.settimeout(request_timeout)
            header = sock.recv(4)
            if len(header) != 4:
                raise ConnectionError("Bridge хариу буцаасангүй.")
            length = struct.unpack("!I", header)[0]
            if length > 8 * 1024 * 1024:
                raise ValueError("Judge response exceeds 8MB.")
            data = b""
            while len(data) < length:
                chunk = sock.recv(length - len(data))
                if not chunk:
                    raise ConnectionError("Bridge response ended early.")
                data += chunk
        return json.loads(data.decode())
    except Exception:
        logger.exception("DMOJ Bridge холболт амжилтгүй; fail-closed retry хийнэ.")
        raise
    finally:
        try:
            bridge_lock.release()
        except Exception:
            logger.warning("Bridge lease %s expired before release.", assigned_bridge)
        logger.info("Released bridge lease %s from %s", assigned_bridge, task_label)


def _acquire_bridge_lease(
    redis_client,
    hosts: list[str],
    *,
    wait_seconds: float,
    lease_seconds: int,
):
    """Acquire one bridge without maintaining a stale shared idle-host list."""
    deadline = time.monotonic() + wait_seconds
    start = int(redis_client.incr("dmoj:bridge:round_robin")) % len(hosts)
    while True:
        for offset in range(len(hosts)):
            host = hosts[(start + offset) % len(hosts)]
            lock = redis_client.lock(
                f"dmoj:bridge:lease:{host}",
                timeout=lease_seconds,
                blocking=False,
                thread_local=False,
            )
            if lock.acquire(blocking=False):
                return host, lock
        if time.monotonic() >= deadline:
            raise TimeoutError(
                "Шүүгч серверүүд ачаалалтай байна. Хүлээх хугацаа хэтэрлээ."
            )
        time.sleep(0.1)


def _apply_dmoj_verdict(db, sub, verdict: dict):
    """DMOJ Bridge-ийн хариуг Submission-д хэрэгжүүлэх."""
    status_map = {
        "AC":  SubmissionStatus.ACCEPTED,
        "WA":  SubmissionStatus.WRONG_ANSWER,
        "TLE": SubmissionStatus.TIME_LIMIT,
        "MLE": SubmissionStatus.MEMORY_LIMIT,
        "OLE": SubmissionStatus.OUTPUT_LIMIT,
        "RTE": SubmissionStatus.RUNTIME_ERROR,
        "CE":  SubmissionStatus.COMPILATION_ERROR,
        "SYSTEM_ERROR": SubmissionStatus.SYSTEM_ERROR,
    }
    sub.status = status_map.get(
        verdict.get("status", "SYSTEM_ERROR"),
        SubmissionStatus.SYSTEM_ERROR,
    )
    sub.score     = verdict.get("score", 0)
    sub.time_ms   = verdict.get("time_ms", 0.0)
    sub.memory_kb = verdict.get("memory_kb", 0.0)
    sub.error_log = verdict.get("error_log")
    from datetime import datetime
    sub.judge_lease_expires_at = None
    sub.judge_finished_at = datetime.utcnow()

    for tc_result in verdict.get("test_results", []):
        jr = JudgeResult(
            submission_id=sub.id,
            testcase_id=tc_result.get("testcase_id", 0),
            status=status_map.get(tc_result.get("status", "WA"), SubmissionStatus.WRONG_ANSWER),
            time_ms=tc_result.get("time_ms", 0.0),
            memory_kb=tc_result.get("memory_kb", 0.0),
            output_log=tc_result.get("checker_output", ""),
            actual_output=None
        )
        db.add(jr)

    db.flush()


def _read_workspace_text(user_id: str, problem_code: str, filename: str, max_bytes: int = 1024 * 1024) -> str:
    """Read a bounded UTF-8 workspace object from MinIO."""
    from pathlib import PurePosixPath

    from app.services.storage import storage_client

    path = PurePosixPath(filename)
    if path.is_absolute() or ".." in path.parts or "\\" in filename:
        raise ValueError(f"Invalid workspace filename: {filename}")
    key = f"{user_id}/{problem_code.upper()}/{filename}"
    response = storage_client.client.get_object("oj-workspace-drafts", key)
    try:
        data = response.read(max_bytes + 1)
    finally:
        response.close()
        response.release_conn()
    if len(data) > max_bytes:
        raise ValueError(f"Workspace file exceeds {max_bytes} bytes: {filename}")
    return data.decode("utf-8")


def _workspace_solution_payload(job) -> dict:
    """Build a bounded, explicit-testcase DMOJ payload from a teacher draft."""
    import yaml

    solution = _read_workspace_text(str(job.user_id), job.problem_code, "solution.cpp", 256 * 1024)
    config_text = _read_workspace_text(str(job.user_id), job.problem_code, "init.yml", 256 * 1024)
    config = yaml.safe_load(config_text) or {}
    configured = config.get("test_cases") or []
    flat_cases = []
    for item in configured:
        nested = item.get("cases") if isinstance(item, dict) else None
        flat_cases.extend(nested if isinstance(nested, list) else [item])
    if not flat_cases:
        raise ValueError("Workspace init.yml has no test cases.")
    if len(flat_cases) > 500:
        raise ValueError("Workspace judge job exceeds 500 test cases.")

    testcases = []
    total_testcase_bytes = 0
    for position, testcase in enumerate(flat_cases, start=1):
        if not isinstance(testcase, dict) or not testcase.get("in") or not testcase.get("out"):
            raise ValueError(f"Invalid testcase entry at position {position}.")
        input_data = _read_workspace_text(str(job.user_id), job.problem_code, str(testcase["in"]))
        output_data = _read_workspace_text(str(job.user_id), job.problem_code, str(testcase["out"]))
        total_testcase_bytes += len(input_data.encode("utf-8")) + len(output_data.encode("utf-8"))
        if total_testcase_bytes > 1536 * 1024:
            raise ValueError("Workspace testcase payload exceeds 1.5MB.")
        testcases.append({
            "id": position,
            "input_data": input_data,
            "output_data": output_data,
            "points": int(testcase.get("points", 10)),
        })

    return {
        "id": 1_000_000_000 + int(job.id),
        "problem": f"workspace-{job.problem_code}",
        "language": "g++20",
        "source": solution,
        "time_limit": min(max(float(config.get("time_limit", 1.0)), 0.1), 30.0),
        "memory_limit_mb": min(max(int(config.get("memory_limit", 64)), 16), 1024),
        "testcases": testcases,
    }


def _workspace_generator_payload(job, parameter_index: int = 0) -> dict:
    """Wrap one testlib parameter row without touching stdin before registerGen."""
    import json
    import re
    import shlex

    request_payload = job.request_payload or {}
    params = request_payload.get("params") or []
    if not isinstance(params, list) or not params or len(params) > 20:
        raise ValueError("Workspace generator requires 1-20 parameter rows.")
    if parameter_index < 0 or parameter_index >= len(params):
        raise ValueError("Generator parameter index is out of range.")

    generator = _read_workspace_text(
        str(job.user_id), job.problem_code, "generator.cpp", 256 * 1024
    )
    row = params[parameter_index]
    if not isinstance(row, str) or not row or len(row.encode("utf-8")) > 256:
        raise ValueError(f"Invalid generator parameters at row {parameter_index + 1}.")
    try:
        args = shlex.split(row, posix=True)
    except ValueError as exc:
        raise ValueError(f"Invalid quoting at generator row {parameter_index + 1}.") from exc
    if len(args) > 20 or any(len(arg.encode("utf-8")) > 128 for arg in args):
        raise ValueError(f"Generator row {parameter_index + 1} exceeds argument limits.")
    values = ["generator", *args]
    declarations = []
    names = []
    for arg_index, value in enumerate(values):
        name = f"workspace_arg_{arg_index}"
        declarations.append(
            f"static char {name}[] = {json.dumps(value, ensure_ascii=True)};"
        )
        names.append(name)
    declarations.append(
        f"static char* workspace_argv[] = {{{', '.join(names)}, nullptr}};"
    )

    rewritten_generator, replacements = re.subn(
        r"registerGen\s*\(\s*argc\s*,\s*argv\s*,\s*([01])\s*\)",
        lambda match: (
            f"argc={len(values)}; argv=workspace_argv; "
            f"registerGen(argc,argv,{match.group(1)})"
        ),
        generator,
        count=1,
    )
    if replacements != 1:
        raise ValueError(
            "generator.cpp must call registerGen(argc, argv, 0|1) in main."
        )
    wrapper = "\n".join([*declarations, rewritten_generator])
    if len(wrapper.encode("utf-8")) > 512 * 1024:
        raise ValueError("Wrapped generator source exceeds 512KB.")

    return {
        "id": 1_100_000_000 + int(job.id) * 100 + parameter_index,
        "problem": f"workspace-generator-{job.problem_code}",
        "language": "g++20",
        "source": wrapper,
        "time_limit": 5.0,
        "memory_limit_mb": 256,
        "capture_output": True,
        "testcases": [
            {"id": parameter_index + 1, "input_data": "", "output_data": "", "points": 1}
        ],
    }


def _workspace_solution_capture_payload(job, generated_inputs: list[str]) -> dict:
    solution = _read_workspace_text(
        str(job.user_id), job.problem_code, "solution.cpp", 256 * 1024
    )
    return {
        "id": 1_200_000_000 + int(job.id),
        "problem": f"workspace-solution-{job.problem_code}",
        "language": "g++20",
        "source": solution,
        "time_limit": 5.0,
        "memory_limit_mb": 256,
        "capture_output": True,
        "testcases": [
            {"id": index + 1, "input_data": data, "output_data": "", "points": 1}
            for index, data in enumerate(generated_inputs)
        ],
    }


def _write_workspace_text(user_id: str, problem_code: str, filename: str, content: str) -> None:
    import io

    from app.services.storage import storage_client

    encoded = content.encode("utf-8")
    storage_client.client.put_object(
        "oj-workspace-drafts",
        f"{user_id}/{problem_code.upper()}/{filename}",
        io.BytesIO(encoded),
        length=len(encoded),
        content_type="text/plain; charset=utf-8",
    )


def _claim_workspace_job(task, job, db) -> bool:
    """Claim QUEUED or expired RUNNING workspace work under its row lock."""
    from datetime import datetime, timedelta

    now = datetime.utcnow()
    if job.status == "RUNNING":
        lease_active = job.lease_expires_at is not None and job.lease_expires_at > now
        redelivered = bool(
            (getattr(task.request, "delivery_info", None) or {}).get("redelivered")
        )
        if lease_active and redelivered:
            countdown = max(1, int((job.lease_expires_at - now).total_seconds()) + 1)
            raise task.retry(
                exc=RuntimeError("Workspace job has an active judge lease."),
                countdown=countdown,
            )
        if lease_active:
            return False
        logger.warning("Reclaiming expired workspace judge lease for job %s.", job.id)
    elif job.status != "QUEUED":
        return False
    job.status = "RUNNING"
    job.judge_attempt = int(job.judge_attempt or 0) + 1
    job.started_at = now
    job.finished_at = None
    job.lease_expires_at = now + timedelta(seconds=settings.JUDGE_LEASE_SECONDS)
    db.commit()
    return True


@celery_app.task(
    name="app.workers.judge_worker.execute_workspace_solution",
    bind=True,
    max_retries=2,
    default_retry_delay=3,
    queue="judge_queue",
)
def execute_workspace_solution(self, job_id: int):
    """Verify a teacher model solution using the same DMOJ sandbox as submissions."""
    from datetime import datetime

    from app.models.workspace_job import WorkspaceJudgeJob

    with _get_sync_session() as db:
        job = (
            db.query(WorkspaceJudgeJob)
            .filter(WorkspaceJudgeJob.id == job_id)
            .with_for_update()
            .first()
        )
        if not job or not _claim_workspace_job(self, job, db):
            return
        try:
            if not ENABLE_JUDGE:
                raise RuntimeError("Judge service is disabled.")
            payload = _workspace_solution_payload(job)
            from datetime import timedelta
            required_lease = max(
                settings.JUDGE_LEASE_SECONDS,
                int(float(payload["time_limit"]) * len(payload["testcases"])) + 120,
            )
            job.lease_expires_at = datetime.utcnow() + timedelta(seconds=required_lease)
            db.commit()
            verdict = _request_dmoj(payload, f"workspace job {job.id}")
            if verdict.get("status") == "SYSTEM_ERROR":
                raise RuntimeError(verdict.get("error_log") or "Judge system error")
            job.status = "FINAL"
            job.result = verdict
            job.error_log = verdict.get("error_log")
            job.finished_at = datetime.utcnow()
            job.lease_expires_at = None
            db.commit()
            return verdict
        except Exception as exc:
            final_attempt = self.request.retries >= self.max_retries
            job.status = "SYSTEM_ERROR" if final_attempt else "QUEUED"
            job.error_log = str(exc)
            job.lease_expires_at = None
            if final_attempt:
                job.finished_at = datetime.utcnow()
            db.commit()
            if not final_attempt:
                raise self.retry(exc=exc)
            return {"status": "SYSTEM_ERROR", "error_log": str(exc), "test_results": []}


@celery_app.task(
    name="app.workers.judge_worker.execute_workspace_generator",
    bind=True,
    max_retries=2,
    default_retry_delay=3,
    queue="judge_queue",
)
def execute_workspace_generator(self, job_id: int):
    """Generate testcase input/output pairs entirely inside DMOJ sandboxes."""
    from datetime import datetime

    from app.models.workspace_job import WorkspaceJudgeJob

    with _get_sync_session() as db:
        job = (
            db.query(WorkspaceJudgeJob)
            .filter(WorkspaceJudgeJob.id == job_id)
            .with_for_update()
            .first()
        )
        if not job or not _claim_workspace_job(self, job, db):
            return
        if job.kind != "generate_testcases":
            job.status = "SYSTEM_ERROR"
            job.error_log = "Workspace job kind does not match generator task."
            job.finished_at = datetime.utcnow()
            job.lease_expires_at = None
            db.commit()
            return

        def finish_with_verdict(stage: str, verdict: dict):
            job.status = "FINAL"
            job.result = {**verdict, "stage": stage}
            job.error_log = verdict.get("error_log")
            job.finished_at = datetime.utcnow()
            job.lease_expires_at = None
            db.commit()
            return job.result

        try:
            if not ENABLE_JUDGE:
                raise RuntimeError("Judge service is disabled.")

            from datetime import timedelta
            expected_count = len((job.request_payload or {}).get("params") or [])
            required_lease = max(
                settings.JUDGE_LEASE_SECONDS,
                expected_count * 5 + 120,
            )
            job.lease_expires_at = datetime.utcnow() + timedelta(seconds=required_lease)
            db.commit()

            generated_inputs = []
            for parameter_index in range(expected_count):
                generator_verdict = _request_dmoj(
                    _workspace_generator_payload(job, parameter_index),
                    f"workspace generator job {job.id} row {parameter_index + 1}",
                )
                if generator_verdict.get("status") == "SYSTEM_ERROR":
                    raise RuntimeError(generator_verdict.get("error_log") or "Judge system error")
                if generator_verdict.get("status") != "AC":
                    generator_verdict["parameter_index"] = parameter_index
                    return finish_with_verdict("generator", generator_verdict)
                generator_results = generator_verdict.get("test_results") or []
                if len(generator_results) != 1:
                    raise RuntimeError("Generator judge returned an incomplete result set.")
                generated_inputs.append(str(generator_results[0].get("program_output", "")))
            total_bytes = sum(len(item.encode("utf-8")) for item in generated_inputs)
            if any(len(item.encode("utf-8")) > 256 * 1024 for item in generated_inputs):
                raise ValueError("A generated testcase exceeds 256KB.")
            if total_bytes > 1536 * 1024:
                raise ValueError("Generated testcase input exceeds 1.5MB in total.")

            solution_verdict = _request_dmoj(
                _workspace_solution_capture_payload(job, generated_inputs),
                f"workspace model solution job {job.id}",
            )
            if solution_verdict.get("status") == "SYSTEM_ERROR":
                raise RuntimeError(solution_verdict.get("error_log") or "Judge system error")
            if solution_verdict.get("status") != "AC":
                return finish_with_verdict("solution", solution_verdict)

            solution_results = solution_verdict.get("test_results") or []
            if len(solution_results) != expected_count:
                raise RuntimeError("Model solution judge returned an incomplete result set.")
            solution_results.sort(key=lambda item: int(item.get("testcase_id", 0)))
            generated_outputs = [str(item.get("program_output", "")) for item in solution_results]
            total_bytes += sum(len(item.encode("utf-8")) for item in generated_outputs)
            if any(len(item.encode("utf-8")) > 256 * 1024 for item in generated_outputs):
                raise ValueError("A generated answer exceeds 256KB.")
            if total_bytes > 3 * 1024 * 1024:
                raise ValueError("Generated testcase artifacts exceed 3MB in total.")

            request_payload = job.request_payload or {}
            points = int(request_payload.get("points_per_case", 10))
            if points < 1 or points > 1000:
                raise ValueError("Invalid points_per_case in workspace job.")
            params = request_payload.get("params") or []
            case_lines = []
            cases = []
            for index, (input_data, output_data) in enumerate(
                zip(generated_inputs, generated_outputs), start=1
            ):
                _write_workspace_text(str(job.user_id), job.problem_code, f"cases/{index}.in", input_data)
                _write_workspace_text(str(job.user_id), job.problem_code, f"cases/{index}.out", output_data)
                sample = ", sample: true" if index == 1 else ""
                case_lines.append(
                    f"  - {{in: cases/{index}.in, out: cases/{index}.out, points: {points}{sample}}}"
                )
                cases.append({"idx": index, "args": params[index - 1]})

            init_content = (
                "archive: cases.zip\n"
                "time_limit: 1.0\n"
                "memory_limit: 64\n"
                "test_cases:\n" + "\n".join(case_lines) + "\n"
            )
            _write_workspace_text(str(job.user_id), job.problem_code, "init.yml", init_content)
            _write_workspace_text(
                str(job.user_id), job.problem_code, "generator.params", "\n".join(params)
            )
            _write_workspace_text(
                str(job.user_id), job.problem_code, "generator.points", str(points)
            )

            result = {
                "status": "AC",
                "stage": "complete",
                "message": f"{expected_count} testcases generated successfully.",
                "cases": cases,
            }
            job.status = "FINAL"
            job.result = result
            job.error_log = None
            job.finished_at = datetime.utcnow()
            job.lease_expires_at = None
            db.commit()
            return result
        except ValueError as exc:
            return finish_with_verdict(
                "validation", {"status": "INVALID_OUTPUT", "error_log": str(exc), "test_results": []}
            )
        except Exception as exc:
            final_attempt = self.request.retries >= self.max_retries
            job.status = "SYSTEM_ERROR" if final_attempt else "QUEUED"
            job.error_log = str(exc)
            job.lease_expires_at = None
            if final_attempt:
                job.finished_at = datetime.utcnow()
            db.commit()
            if not final_attempt:
                raise self.retry(exc=exc)
            return {"status": "SYSTEM_ERROR", "error_log": str(exc), "test_results": []}


# ─── XP Engine (Simplified — Phase 2-д бүрэн болгоно) ───────────────────────

def _award_xp(db, user_id, problem, submission=None):
    """AC дүнд XP олгох, Streak шинэчлэх, Түвшин ба Амжилтуудыг шалгах."""
    from datetime import date, datetime
    from app.models.progression import StudentProgress
    
    if submission is not None and submission.rewards_applied_at is not None:
        return
    progress = db.query(StudentProgress).filter(StudentProgress.user_id == user_id).first()
    if not progress:
        if submission is not None:
            submission.rewards_applied_at = datetime.utcnow()
        return

    xp = getattr(problem, "xp_reward", 20)
    progress.total_xp    += xp
    progress.solved_count += 1

    # Streak шинэчлэх (Asia/Ulaanbaatar цагийн бүсээр)
    from zoneinfo import ZoneInfo
    from datetime import timezone
    tz = ZoneInfo("Asia/Ulaanbaatar")
    today = datetime.now(tz).date()
    
    if progress.last_active_date:
        # DB-д naive UTC байгаа тул timezone-aware болгоод Ulaanbaatar бүс рүү хөрвүүлнэ
        last_utc = progress.last_active_date.replace(tzinfo=timezone.utc)
        last = last_utc.astimezone(tz).date()
        delta = (today - last).days
        if delta == 1:
            progress.current_streak += 1
        elif delta > 1:
            progress.current_streak = 1
    else:
        progress.current_streak = 1

    if progress.current_streak > progress.highest_streak:
        progress.highest_streak = progress.current_streak

    progress.last_active_date = datetime.utcnow()
    if submission is not None:
        submission.rewards_applied_at = datetime.utcnow()
    db.commit()
    logger.info(f"User {user_id}: +{xp} XP, streak={progress.current_streak}")

    # Gamification Event-үүдийг шалгаж ажиллуулах
    _publish_gamification_event(user_id, {
        "event": "XP_AWARDED",
        "amount": xp,
        "reason": f"Бодлого бодсон: {problem.title}",
        "total_xp": progress.total_xp
    })

    # Final verdict + үндсэн XP аль хэдийн нэг transaction-аар commit болсон.
    # Нэмэлт gamification hook алдаа гаргавал judge task-ийг retry хийж,
    # terminal submission-ийг буцааж PENDING болгох ёсгүй.
    _run_post_reward_hooks(db, progress, user_id)


def _run_post_reward_hooks(db, progress, user_id):
    """Run optional gamification updates without changing a final judge result."""
    for hook in (_check_level_up, _check_achievements):
        try:
            hook(db, progress)
        except Exception:
            db.rollback()
            logger.exception(
                "Post-reward hook %s failed for user %s; judge result remains final.",
                getattr(hook, "__name__", hook.__class__.__name__),
                user_id,
            )


def _check_level_up(db, progress):
    """Сурагчийн түвшин ахисан эсэхийг sync байдлаар шалгаж шинэчилнэ."""
    from app.models.progression import StudentLevel
    levels = db.query(StudentLevel).order_by(StudentLevel.order.desc()).all()
    
    suitable_level = None
    for lvl in levels:
        if progress.total_xp >= lvl.min_xp and progress.solved_count >= lvl.required_solved:
            suitable_level = lvl
            break
            
    if suitable_level and suitable_level.id != progress.current_level_id:
        old_lvl = db.query(StudentLevel).filter(StudentLevel.id == progress.current_level_id).first()
        old_name = old_lvl.name if old_lvl else "Bronze"
        
        progress.current_level_id = suitable_level.id
        db.commit()
        
        _publish_gamification_event(progress.user_id, {
            "event": "LEVEL_UP",
            "old_level": old_name,
            "new_level": suitable_level.name
        })


def _check_achievements(db, progress):
    """Сурагчийн шинээр нээгдэх амжилтуудыг sync байдлаар шалгаж шинэчилнэ."""
    from app.models.gamification import Achievement, UserAchievement
    
    ACH_RULES = {
        "FIRST_AC": lambda p: p.solved_count >= 1,
        "SOLVED_10": lambda p: p.solved_count >= 10,
        "SOLVED_50": lambda p: p.solved_count >= 50,
        "STREAK_7": lambda p: p.highest_streak >= 7,
        "RATING_1300": lambda p: p.elo_rating >= 1300
    }
    
    # Хэрэглэгчийн аль хэдийн авсан амжилтуудыг авах
    owned = [ua.achievement_id for ua in db.query(UserAchievement).filter(UserAchievement.user_id == progress.user_id).all()]
    
    for code, check_fn in ACH_RULES.items():
        ach = db.query(Achievement).filter(Achievement.code == code).first()
        if ach and ach.id not in owned and check_fn(progress):
            # Шинэ амжилт нээх
            ua = UserAchievement(user_id=progress.user_id, achievement_id=ach.id)
            db.add(ua)
            db.commit()
            
            # Redis Pub/Sub руу илгээх
            _publish_gamification_event(progress.user_id, {
                "event": "ACHIEVEMENT_UNLOCKED",
                "code": ach.code,
                "title": ach.title,
                "description": ach.description,
                "icon": ach.icon,
                "xp_bonus": ach.xp_bonus
            })
            
            # Bonus XP оноо олгох
            progress.total_xp += ach.xp_bonus
            db.commit()


def _publish_gamification_event(user_id, payload):
    """Redis рүү геймификацийн event-үүдийг илгээх helper."""
    try:
        import redis, json
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        r.publish(f"user_progress:{user_id}", json.dumps(payload))
    except Exception as e:
        logger.warning(f"Failed to publish gamification event to Redis: {e}")


# ─── Redis Pub/Sub ────────────────────────────────────────────────────────────

def _publish_result(submission_id: int, status: str, score: int, time_ms: float = 0.0, memory_kb: float = 0.0, judge_results: list = None):
    """WebSocket handler-т дүнг Redis-ээр дамжуулах."""
    try:
        import redis, json
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        payload = {
            "submission_id": submission_id,
            "status": status,
            "score": score,
            "time_ms": time_ms,
            "memory_kb": memory_kb,
            "judge_results": judge_results or []
        }
        r.publish(
            f"submission:{submission_id}",
            json.dumps(payload),
        )
    except Exception as e:
        logger.warning(f"Redis publish алдаа: {e}")


def _update_contest_scoreboard(db, problem_id, submission):
    """Шинэ илгээлт тэмцээнд хамааралтай бол scoreboard-ийг шинэчлэн Redis Pub/Sub рүү цацна."""
    try:
        from app.models.contest import Contest, ContestProblem, ContestParticipant
        from app.models.submission import Submission, SubmissionStatus
        from datetime import datetime
        import redis, json

        # Идэвхтэй тэмцээн байгаа эсэхийг шалгах (бодлого нь тэмцээнд хамаатай бөгөөд илгээсэн цаг нь тэмцээний үед байх)
        active_contests = db.query(Contest).join(ContestProblem).filter(
            ContestProblem.problem_id == problem_id,
            Contest.start_time <= submission.submitted_at,
            Contest.end_time >= submission.submitted_at
        ).all()

        for contest in active_contests:
            participants = db.query(ContestParticipant).filter(ContestParticipant.contest_id == contest.id).all()
            c_problems = db.query(ContestProblem).filter(ContestProblem.contest_id == contest.id).all()
            
            prob_ids = [cp.problem_id for cp in c_problems]
            prob_id_to_code = {cp.problem_id: cp.problem.code for cp in c_problems if cp.problem}
            prob_max_points = {cp.problem_id: cp.points for cp in c_problems}

            # Тэмцээний үеийн submissions
            subs = db.query(Submission).filter(
                Submission.submitted_at >= contest.start_time,
                Submission.submitted_at <= contest.end_time,
                Submission.problem_id.in_(prob_ids)
            ).order_by(Submission.submitted_at.asc()).all()

            standings = {}
            for p in participants:
                user = p.user
                if not user:
                    continue
                standings[p.user_id] = {
                    "user_id": str(p.user_id),
                    "username": user.username,
                    "total_score": 0,
                    "total_time_ms": 0.0,
                    "problem_results": {pid: {"problem_code": prob_id_to_code[pid], "score": 0, "attempts": 0, "time_ms": 0.0} for pid in prob_ids}
                }

            for s in subs:
                if s.user_id not in standings:
                    continue
                
                p_res = standings[s.user_id]["problem_results"][s.problem_id]
                max_limit = prob_max_points[s.problem_id]
                if p_res["score"] >= max_limit:
                    continue

                p_res["attempts"] += 1
                
                sub_score = int((s.score / 100.0) * max_limit) if s.score else 0
                if s.status == SubmissionStatus.ACCEPTED:
                    sub_score = max_limit

                if sub_score > p_res["score"]:
                    p_res["score"] = sub_score
                    p_res["time_ms"] = (s.submitted_at - contest.start_time).total_seconds() * 1000

            # Нийлбэр дүнгүүд
            rows = []
            for uid, data in standings.items():
                total_score = 0
                total_time_ms = 0.0
                p_res_list = []
                for pid, res in data["problem_results"].items():
                    total_score += res["score"]
                    total_time_ms += res["time_ms"]
                    p_res_list.append(res)

                rows.append({
                    "user_id": uid,
                    "username": data["username"],
                    "total_score": total_score,
                    "total_time_ms": total_time_ms,
                    "problem_results": p_res_list
                })

            # Эрэмбэлэх
            rows.sort(key=lambda x: (-x["total_score"], x["total_time_ms"]))
            for idx, r_row in enumerate(rows):
                r_row["rank"] = idx + 1

            # Redis-т standings-ийг цацах
            r_redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
            r_redis.publish(f"contest_scoreboard:{contest.id}", json.dumps(rows))
            logger.info(f"Published contest scoreboard update for contest {contest.id}")

            # Багийн scoreboard шинэчлэн цацах
            _publish_contest_team_scoreboard(db, contest.id)

    except Exception as e:
        logger.exception(f"Error updating contest scoreboard in Celery: {e}")


def _publish_contest_team_scoreboard(db, contest_id: int):
    """Багийн live scoreboard-ийг тооцоолж Redis-ээр дамжуулах."""
    try:
        from app.models.contest import Contest, ContestProblem, ContestTeam, Team, TeamMember
        from app.models.submission import Submission, SubmissionStatus
        from app.models.user import User
        import redis, json

        contest = db.query(Contest).filter(Contest.id == contest_id).first()
        if not contest:
            return

        c_problems = db.query(ContestProblem).filter(ContestProblem.contest_id == contest_id).all()
        prob_ids = [cp.problem_id for cp in c_problems]
        prob_id_to_code = {cp.problem_id: cp.problem.code for cp in c_problems if cp.problem}
        prob_max_points = {cp.problem_id: cp.points for cp in c_problems}

        contest_teams = db.query(ContestTeam).filter(ContestTeam.contest_id == contest_id).all()
        BALLOON_HEX = ["#ef4444", "#10b981", "#06b6d4", "#f59e0b", "#8b5cf6"]

        rows = []
        for ct in contest_teams:
            team = ct.team
            if not team:
                continue
            member_ids = [m.user_id for m in team.members]

            m_usernames = []
            for m in team.members:
                user = db.query(User.username).filter(User.id == m.user_id).first()
                if user:
                    m_usernames.append(user[0])

            # Багийн гишүүдээс тэмцээний үед илгээсэн submissions
            subs = db.query(Submission).filter(
                Submission.submitted_at >= contest.start_time,
                Submission.submitted_at <= contest.end_time,
                Submission.problem_id.in_(prob_ids),
                Submission.user_id.in_(member_ids)
            ).order_by(Submission.submitted_at.asc()).all()

            prob_results = {pid: {"score": 0, "attempts": 0, "time_minutes": 0.0, "is_solved": False} for pid in prob_ids}
            for pid in prob_ids:
                p_subs = [s for s in subs if s.problem_id == pid]
                max_limit = prob_max_points[pid]
                for s in p_subs:
                    if prob_results[pid]["is_solved"]:
                        continue
                    prob_results[pid]["attempts"] += 1
                    sub_score = int((s.score / 100.0) * max_limit) if s.score else 0
                    if s.status == SubmissionStatus.ACCEPTED:
                        sub_score = max_limit
                    if sub_score > prob_results[pid]["score"]:
                        prob_results[pid]["score"] = sub_score
                        duration_mins = (s.submitted_at - contest.start_time).total_seconds() / 60.0
                        prob_results[pid]["time_minutes"] = round(duration_mins, 2)
                    if s.status == SubmissionStatus.ACCEPTED:
                        prob_results[pid]["is_solved"] = True

            solved_count = 0
            total_penalty = 0.0
            balloons = []
            p_res_list = []

            for idx, cp in enumerate(c_problems):
                pid = cp.problem_id
                res = prob_results[pid]
                if res["is_solved"]:
                    solved_count += 1
                    penalty = res["time_minutes"] + 20 * (res["attempts"] - 1)
                    total_penalty += penalty
                    color = BALLOON_HEX[idx % len(BALLOON_HEX)]
                    balloons.append(color)

                p_res_list.append({
                    "problem_code": prob_id_to_code[pid],
                    "score": res["score"],
                    "attempts": res["attempts"],
                    "time_minutes": res["time_minutes"],
                    "is_solved": res["is_solved"]
                })

            rows.append({
                "team_id": team.id,
                "team_name": team.name,
                "school": team.school,
                "members": m_usernames,
                "solved_count": solved_count,
                "total_penalty": round(total_penalty, 2),
                "problem_results": p_res_list,
                "balloons": balloons
            })

        rows.sort(key=lambda x: (-x["solved_count"], x["total_penalty"]))
        for idx, r_row in enumerate(rows):
            r_row["rank"] = idx + 1

        r_redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
        r_redis.publish(f"contest_team_scoreboard:{contest_id}", json.dumps(rows))
        logger.info(f"Published contest team scoreboard update for contest {contest_id}")

    except Exception as e:
        logger.exception(f"Error publishing contest team scoreboard in Celery: {e}")
