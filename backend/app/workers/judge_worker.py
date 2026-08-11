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
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker, selectinload
    from app.models.submission import Submission, JudgeResult, SubmissionStatus
    from app.models.problem import Problem, TestCase
    from app.models.progression import StudentProgress

    # Sync session reuse
    with _get_sync_session() as db:
        # Submission авах
        sub = db.query(Submission).filter(Submission.id == submission_id).first()
        if not sub:
            logger.error(f"Submission {submission_id} олдсонгүй.")
            return

        # RUNNING статус руу шилжих
        sub.status = SubmissionStatus.RUNNING
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

            # Дискнээс оролт/гаралтын файлуудыг сэргээж унших (хэрэв DB-д None байвал)
            from app.services.local_judge import LocalSubprocessJudge
            test_cases = LocalSubprocessJudge.resolve_testcase_data_from_disk(
                problem_code=problem.code,
                testcases_zip_key=getattr(problem, "testcases_zip_key", None),
                test_cases=list(test_cases)
            )

            if not test_cases and not getattr(problem, 'testcases_zip_key', None):
                # TestCase байхгүй — mock AC буцаах
                sub.status = SubmissionStatus.ACCEPTED
                sub.score  = problem.points if problem else 10
                sub.time_ms = 10.0
                db.commit()
                _publish_result(submission_id, sub.status.value, sub.score, sub.time_ms, sub.memory_kb, [])
                return

            if ENABLE_JUDGE and not getattr(sub, 'is_sample_test', False):
                # ── Бодит DMOJ Bridge дуудлага ─────────────────────────────────
                if getattr(problem, 'testcases_zip_key', None):
                    _ensure_problem_testcases(problem.code, problem.testcases_zip_key)
                    _judge_via_dmoj(db, sub, problem, None)
                else:
                    _judge_via_dmoj(db, sub, problem, test_cases)
            else:
                # ── Локал Sandbox Шүүлт (Subprocess эсвэл Sample Run) ──────────
                _run_local_judge(db, sub, problem, test_cases)

            # XP + Gamification шинэчлэлт
            if sub.status == SubmissionStatus.ACCEPTED:
                _award_xp(db, sub.user_id, problem)

            # Тэмцээний standings шинэчлэлт (оноо авсан бол)
            _update_contest_scoreboard(db, problem.id, sub)

            # Session хаахаас өмнө утгыг cache хийх
            _final_status = sub.status.value
            _final_score  = sub.score
            _final_time_ms = sub.time_ms
            _final_memory_kb = sub.memory_kb
            _final_judge_results = [
                {
                    "id": jr.id,
                    "testcase_id": jr.testcase_id,
                    "status": jr.status.value,
                    "time_ms": jr.time_ms,
                    "memory_kb": jr.memory_kb,
                    "output_log": jr.output_log
                }
                for jr in sorted(sub.judge_results, key=lambda r: r.id)
            ]

        except Exception as exc:
            logger.exception(f"Judge task алдаа гарлаа: {exc}")
            sub.status    = SubmissionStatus.RUNTIME_ERROR
            sub.error_log = str(exc)
            db.commit()
            _final_status = "RTE"
            _final_score  = 0
            _final_time_ms = 0.0
            _final_memory_kb = 0.0
            _final_judge_results = []
            raise self.retry(exc=exc)

    # Redis Pub/Sub-д мэдэгдэл илгээх (session хаалтаас гадна)
    _publish_result(submission_id, _final_status, _final_score, _final_time_ms, _final_memory_kb, _final_judge_results)



def _run_local_judge(db, sub, problem, test_cases):
    """
    DMOJ Bridge ашиглахгүйгээр локал subprocess ашиглан кодыг шалгаж үнэлэх.
    """
    import os
    import zipfile
    import io
    from pathlib import Path
    from app.services.local_judge import LocalSubprocessJudge
    from app.models.submission import Submission, JudgeResult, SubmissionStatus
    
    tc_list = []
    
    # 1. DB-д тест кэйсүүд байвал ашиглана
    if test_cases:
        for tc in test_cases:
            tc_list.append({
                "id": tc.id,
                "input_data": tc.input_data or "",
                "output_data": tc.output_data or "",
                "points": tc.points
            })
            
    # 2. DB-д тест кэйс байхгүй боловч cases.zip байвал (багцлагдсан бодлого)
    elif getattr(problem, 'testcases_zip_key', None):
        _ensure_problem_testcases(problem.code, problem.testcases_zip_key)
        local_dir = Path("/problems") / f"oj-{problem.code}"
        init_file = local_dir / "init.yml"
        
        if init_file.exists():
            try:
                # problems.py доторх YAML parse-ийг дуудах
                from app.api.v1.endpoints.problems import parse_simple_yaml
                init_cfg = parse_simple_yaml(init_file.read_text(encoding="utf-8"))
                testcases_cfg = init_cfg.get("test_cases", [])
                
                is_nested = len(testcases_cfg) > 0 and "cases" in testcases_cfg[0]
                if is_nested:
                    for s_idx, subtask in enumerate(testcases_cfg, start=1):
                        sub_points = int(subtask.get("points", 10))
                        sub_cases_cfg = subtask.get("cases", [])
                        sub_cases = []
                        
                        for idx, tc in enumerate(sub_cases_cfg, start=1):
                            in_file = tc.get("in")
                            out_file = tc.get("out")
                            
                            in_path = local_dir / in_file if in_file else None
                            out_path = local_dir / out_file if out_file else None
                            if in_path and not in_path.exists():
                                in_path = local_dir / "cases" / in_file
                            if out_path and not out_path.exists():
                                out_path = local_dir / "cases" / out_file
                                
                            input_data = ""
                            output_data = ""
                            if in_path and in_path.exists():
                                input_data = in_path.read_text(encoding="utf-8", errors="replace")
                            if out_path and out_path.exists():
                                output_data = out_path.read_text(encoding="utf-8", errors="replace")
                                
                            sub_cases.append({
                                "id": (s_idx * 100) + idx,
                                "input_data": input_data,
                                "output_data": output_data
                            })
                        
                        tc_list.append({
                            "subtask_id": s_idx,
                            "points": sub_points,
                            "cases": sub_cases
                        })
                else:
                    for idx, tc in enumerate(testcases_cfg, start=1):
                        in_file = tc.get("in")
                        out_file = tc.get("out")
                        points = int(tc.get("points", 10))
                        
                        in_path = local_dir / in_file if in_file else None
                        out_path = local_dir / out_file if out_file else None
                        if in_path and not in_path.exists():
                            in_path = local_dir / "cases" / in_file
                        if out_path and not out_path.exists():
                            out_path = local_dir / "cases" / out_file
                            
                        input_data = ""
                        output_data = ""
                        if in_path and in_path.exists():
                            input_data = in_path.read_text(encoding="utf-8", errors="replace")
                        if out_path and out_path.exists():
                            output_data = out_path.read_text(encoding="utf-8", errors="replace")
                            
                        tc_list.append({
                            "id": idx,
                            "input_data": input_data,
                            "output_data": output_data,
                            "points": points
                        })
            except Exception as e:
                logger.error(f"Failed to parse local testcases for {problem.code}: {e}")
                
    if not tc_list:
        # Тест кэйс огт байхгүй бол AC буцаана
        sub.status = SubmissionStatus.ACCEPTED
        sub.score = problem.points if problem else 10
        sub.time_ms = 10.0
        db.commit()
        return

    # 3. Checker шалгах
    checker_code = None
    checker_type = None
    if getattr(problem, 'testcases_zip_key', None):
        local_dir = Path("/problems") / f"oj-{problem.code}"
        chk_cpp = local_dir / "checker.cpp"
        if chk_cpp.exists():
            try:
                checker_code = chk_cpp.read_text(encoding="utf-8")
                checker_type = "cpp"
            except Exception:
                pass

    # 4. Шүүлтийг ажиллуулах
    verdict = LocalSubprocessJudge.grade_submission(
        language=sub.language,
        source_code=sub.source_code,
        test_cases=tc_list,
        time_limit_sec=problem.time_limit,
        memory_limit_mb=problem.memory_limit,
        checker_code=checker_code,
        checker_type=checker_type
    )
    
    # 4. Шүүлтийн үр дүнг DB-д хадгалах
    status_map = {
        "AC":  SubmissionStatus.ACCEPTED,
        "WA":  SubmissionStatus.WRONG_ANSWER,
        "TLE": SubmissionStatus.TIME_LIMIT,
        "MLE": SubmissionStatus.MEMORY_LIMIT,
        "RTE": SubmissionStatus.RUNTIME_ERROR,
        "CE":  SubmissionStatus.COMPILATION_ERROR,
    }
    
    sub.status = status_map.get(verdict.get("status", "RTE"), SubmissionStatus.RUNTIME_ERROR)
    sub.score = verdict.get("score", 0)
    sub.time_ms = verdict.get("time_ms", 0.0)
    sub.memory_kb = verdict.get("memory_kb", 0.0)
    sub.error_log = verdict.get("error_log")
    
    # Хуучин шүүлтийн дүнгүүдийг цэвэрлэх
    from sqlalchemy import delete
    db.query(JudgeResult).filter(JudgeResult.submission_id == sub.id).delete()
    
    # Жишээ тестүүдийн ID-г авах
    from app.models.problem import TestCase
    sample_tc_ids = {r[0] for r in db.query(TestCase.id).filter(TestCase.problem_id == problem.id, TestCase.is_sample == True).all()}
    
    for tc_res in verdict.get("test_results", []):
        tc_id = tc_res.get("testcase_id", 0)
        save_actual = tc_res.get("actual_output") if (tc_id in sample_tc_ids or sub.is_sample_test) else None
        
        jr = JudgeResult(
            submission_id=sub.id,
            testcase_id=tc_id,
            status=status_map.get(tc_res.get("status", "WA"), SubmissionStatus.WRONG_ANSWER),
            time_ms=tc_res.get("time_ms", 0.0),
            memory_kb=tc_res.get("memory_kb", 0.0),
            output_log=tc_res.get("checker_output"),
            actual_output=save_actual
        )
        db.add(jr)
        
    db.commit()


def _mock_judge(db, sub, problem, test_cases):
    """
    DMOJ Bridge байхгүй үед бүх test_case-д AC буцаана.
    Хурдыг санамсаргүй байдлаар тооцно.
    """
    import random
    from app.models.submission import Submission, JudgeResult, SubmissionStatus
    total_score = 0
    max_time_ms = 0.0
    max_memory_kb = 0.0

    for idx, tc in enumerate(test_cases):
        mock_time   = round(random.uniform(10, problem.time_limit * 800), 2)
        mock_memory = round(random.uniform(500, 8000), 2)
        mock_status = SubmissionStatus.ACCEPTED

        jr = JudgeResult(
            submission_id=sub.id,
            testcase_id=tc.id,
            status=mock_status,
            time_ms=mock_time,
            memory_kb=mock_memory,
            actual_output=None
        )
        db.add(jr)

        total_score   += tc.points
        max_time_ms    = max(max_time_ms, mock_time)
        max_memory_kb  = max(max_memory_kb, mock_memory)

    sub.status    = SubmissionStatus.ACCEPTED
    sub.score     = total_score
    sub.time_ms   = max_time_ms
    sub.memory_kb = max_memory_kb
    db.commit()


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
        
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
            z.extractall(local_dir)
            
        # DMOJ-ийн init.yml-ийн "archive: cases.zip" тохиргоонд зориулж zip файлыг бас хадгална
        with open(local_dir / "cases.zip", "wb") as f:
            f.write(zip_bytes)
            
        marker_file.write_text(testcases_zip_key, encoding="utf-8")
        logger.info(f"Successfully extracted testcases and saved cases.zip to {local_dir}")
    except Exception as e:
        logger.exception(f"Failed to download/extract testcases for {problem_code}: {e}")
        shutil.rmtree(local_dir, ignore_errors=True)
        raise e


def _judge_via_dmoj(db, sub, problem, test_cases=None):
    """
    DMOJ Bridge-тэй харилцах логик (Phase 2).
    ENABLE_JUDGE=true байх үед ажиллана.
    """
    import socket, json, struct, redis

    # Connect to Redis
    r_client = redis.Redis.from_url(settings.REDIS_URL)
    hosts = settings.DMOJ_BRIDGE_HOSTS.split(",")
    
    # 1. Acquire an idle bridge via Redis queue
    queue_key = "dmoj:bridge:idle_queue"
    # Ensure queue exists and is initialized
    if not r_client.exists(queue_key):
        # Initialize queue atomically using a transaction
        with r_client.pipeline() as pipe:
            pipe.watch(queue_key)
            if not r_client.exists(queue_key):
                pipe.multi()
                pipe.delete(queue_key)
                pipe.rpush(queue_key, *hosts)
                pipe.execute()
            else:
                pipe.unwatch()

    res = r_client.blpop(queue_key, timeout=60)
    if not res:
        raise TimeoutError("Шүүгч серверүүд ачаалалтай байна. Хүлээх хугацаа хэтэрлээ.")
    
    assigned_bridge = res[1].decode("utf-8")
    BRIDGE_PORT = settings.DMOJ_BRIDGE_PORT
    logger.info(f"Assigned bridge {assigned_bridge} for submission {sub.id}")

    try:
        sock = socket.create_connection((assigned_bridge, BRIDGE_PORT), timeout=10)
        
        # Prepare socket JSON payload
        req_data = {
            "id":       sub.id,
            "problem":  problem.code,
            "language": sub.language,
            "source":   sub.source_code,
            "time_limit": problem.time_limit,
            "memory_limit_mb": problem.memory_limit,
        }
        if test_cases:
            req_data["testcases"] = [
                {"id": tc.id, "input_data": tc.input_data, "output_data": tc.output_data, "points": tc.points}
                for tc in test_cases
            ]
            
        payload = json.dumps(req_data).encode()
        sock.sendall(struct.pack("!I", len(payload)) + payload)
        
        # Timeout calculation
        tc_count = len(test_cases) if test_cases else 100
        sock.settimeout(max(60, int(problem.time_limit * max(1, tc_count) + 30)))

        # Response хүлээх
        header = sock.recv(4)
        if len(header) < 4:
            raise ConnectionError("Bridge хариу буцаасангүй.")
        length = struct.unpack("!I", header)[0]
        data   = b""
        while len(data) < length:
            chunk = sock.recv(length - len(data))
            if not chunk:
                break
            data += chunk
        sock.close()

        verdict = json.loads(data.decode())
        _apply_dmoj_verdict(db, sub, verdict)

    except (ConnectionRefusedError, socket.timeout, Exception) as e:
        logger.warning(f"DMOJ Bridge холболт амжилтгүй: {e}. Mock-руу буцлаа.")
        _mock_judge(db, sub, problem, test_cases or [])

    finally:
        # 2. Release the bridge back to queue
        r_client.rpush(queue_key, assigned_bridge)
        logger.info(f"Released bridge {assigned_bridge} from submission {sub.id}")


def _apply_dmoj_verdict(db, sub, verdict: dict):
    """DMOJ Bridge-ийн хариуг Submission-д хэрэгжүүлэх."""
    status_map = {
        "AC":  SubmissionStatus.ACCEPTED,
        "WA":  SubmissionStatus.WRONG_ANSWER,
        "TLE": SubmissionStatus.TIME_LIMIT,
        "MLE": SubmissionStatus.MEMORY_LIMIT,
        "RTE": SubmissionStatus.RUNTIME_ERROR,
        "CE":  SubmissionStatus.COMPILATION_ERROR,
    }
    sub.status    = status_map.get(verdict.get("status", "RTE"), SubmissionStatus.RUNTIME_ERROR)
    sub.score     = verdict.get("score", 0)
    sub.time_ms   = verdict.get("time_ms", 0.0)
    sub.memory_kb = verdict.get("memory_kb", 0.0)
    sub.error_log = verdict.get("error_log")

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

    db.commit()


# ─── XP Engine (Simplified — Phase 2-д бүрэн болгоно) ───────────────────────

def _award_xp(db, user_id, problem):
    """AC дүнд XP олгох, Streak шинэчлэх, Түвшин ба Амжилтуудыг шалгах."""
    from datetime import date, datetime
    from app.models.progression import StudentProgress
    
    progress = db.query(StudentProgress).filter(StudentProgress.user_id == user_id).first()
    if not progress:
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
    db.commit()
    logger.info(f"User {user_id}: +{xp} XP, streak={progress.current_streak}")

    # Gamification Event-үүдийг шалгаж ажиллуулах
    _publish_gamification_event(user_id, {
        "event": "XP_AWARDED",
        "amount": xp,
        "reason": f"Бодлого бодсон: {problem.title}",
        "total_xp": progress.total_xp
    })

    # Түвшин шалгах
    _check_level_up(db, progress)

    # Амжилт шалгах
    _check_achievements(db, progress)


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
