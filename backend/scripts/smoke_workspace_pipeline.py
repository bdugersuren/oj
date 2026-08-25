"""End-to-end smoke for workspace API dispatch, MinIO, Celery, and DMOJ."""
import asyncio
import io
import json
import time
import uuid

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.workspace import (
    GeneratePayload,
    generate_workspace_testcases,
    verify_workspace_solution,
)
from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine as async_engine
from app.models.user import User, UserRole
from app.models.workspace_job import WorkspaceJudgeJob
from app.services.storage import storage_client


BUCKET = "oj-workspace-drafts"
SYNC_DATABASE_URL = settings.DATABASE_URL.replace("+asyncpg", "")
Session = sessionmaker(bind=create_engine(SYNC_DATABASE_URL, pool_pre_ping=True))


def seed_teacher() -> User:
    suffix = uuid.uuid4().hex[:10]
    with Session.begin() as db:
        teacher = User(
            email=f"workspace-{suffix}@example.invalid",
            username=f"workspace_{suffix}",
            hashed_password="not-used",
            role=UserRole.TEACHER,
            is_active=True,
            is_verified=True,
        )
        db.add(teacher)
        db.flush()
        db.expunge(teacher)
        return teacher


def put_text(user_id: uuid.UUID, code: str, filename: str, content: str) -> None:
    encoded = content.encode("utf-8")
    storage_client.client.put_object(
        BUCKET,
        f"{user_id}/{code}/{filename}",
        io.BytesIO(encoded),
        length=len(encoded),
        content_type="text/plain; charset=utf-8",
    )


def get_text(user_id: uuid.UUID, code: str, filename: str) -> str:
    response = storage_client.client.get_object(
        BUCKET, f"{user_id}/{code}/{filename}"
    )
    try:
        return response.read().decode("utf-8")
    finally:
        response.close()
        response.release_conn()


def wait_for_job(job_id: int, timeout: float = 120) -> dict:
    deadline = time.monotonic() + timeout
    last_status = None
    while time.monotonic() < deadline:
        with Session() as db:
            job = db.get(WorkspaceJudgeJob, job_id)
            if job is None:
                raise AssertionError(f"Workspace job {job_id} disappeared")
            last_status = job.status
            if job.status in {"FINAL", "SYSTEM_ERROR"}:
                return {
                    "status": job.status,
                    "result": job.result,
                    "error_log": job.error_log,
                    "attempt": job.judge_attempt,
                    "lease_expires_at": job.lease_expires_at,
                }
        time.sleep(0.1)
    raise TimeoutError(f"Workspace job {job_id} incomplete: {last_status}")


async def dispatch(teacher: User, code: str) -> tuple[int, int]:
    async with AsyncSessionLocal() as db:
        verify = await verify_workspace_solution(
            code,
            current_user=teacher,
            db=db,
        )
    verify_id = int(verify["job_id"])
    verified = await asyncio.to_thread(wait_for_job, verify_id)
    assert verified["status"] == "FINAL", verified
    assert verified["result"]["status"] == "AC", verified
    assert verified["attempt"] == 1, verified
    assert verified["lease_expires_at"] is None, verified

    async with AsyncSessionLocal() as db:
        generated = await generate_workspace_testcases(
            code,
            GeneratePayload(params=["1 10", "50 60"], points_per_case=25),
            current_user=teacher,
            db=db,
        )
    generate_id = int(generated["job_id"])
    generation = await asyncio.to_thread(wait_for_job, generate_id)
    assert generation["status"] == "FINAL", generation
    assert generation["result"]["status"] == "AC", generation
    assert generation["result"]["stage"] == "complete", generation
    assert generation["attempt"] == 1, generation
    assert generation["lease_expires_at"] is None, generation
    return verify_id, generate_id


def cleanup(teacher_id: uuid.UUID, code: str) -> None:
    prefix = f"{teacher_id}/{code}/"
    objects = storage_client.client.list_objects(BUCKET, prefix=prefix, recursive=True)
    for item in objects:
        storage_client.client.remove_object(BUCKET, item.object_name)
    with Session.begin() as db:
        db.query(WorkspaceJudgeJob).filter(
            WorkspaceJudgeJob.user_id == teacher_id
        ).delete(synchronize_session=False)
        teacher = db.get(User, teacher_id)
        if teacher is not None:
            db.delete(teacher)


async def run_pipeline() -> None:
    teacher = seed_teacher()
    code = f"WSP{uuid.uuid4().hex[:8]}".upper()
    if not storage_client.client.bucket_exists(BUCKET):
        storage_client.client.make_bucket(BUCKET)
    put_text(
        teacher.id,
        code,
        "solution.cpp",
        "#include <iostream>\nint main(){long long a,b;std::cin>>a>>b;std::cout<<a+b<<'\\n';}",
    )
    put_text(
        teacher.id,
        code,
        "generator.cpp",
        '#include "testlib.h"\n#include <iostream>\n'
        "int main(int argc,char** argv){registerGen(argc,argv,1);"
        "std::cout<<opt<int>(1)<<' '<<opt<int>(2)<<'\\n';}",
    )
    put_text(
        teacher.id,
        code,
        "init.yml",
        "time_limit: 1\nmemory_limit: 64\ntest_cases:\n"
        "  - {in: cases/1.in, out: cases/1.out, points: 10}\n",
    )
    put_text(teacher.id, code, "cases/1.in", "2 3\n")
    put_text(teacher.id, code, "cases/1.out", "5\n")

    try:
        verify_id, generate_id = await dispatch(teacher, code)
        assert get_text(teacher.id, code, "cases/1.in") == "1 10\n"
        assert get_text(teacher.id, code, "cases/1.out") == "11\n"
        assert get_text(teacher.id, code, "cases/2.in") == "50 60\n"
        assert get_text(teacher.id, code, "cases/2.out") == "110\n"
        init_yml = get_text(teacher.id, code, "init.yml")
        assert "points: 25, sample: true" in init_yml
        assert "cases/2.out" in init_yml
        print(json.dumps({
            "status": "AC",
            "verify_job": verify_id,
            "generator_job": generate_id,
            "minio_round_trip": True,
            "generated_cases": 2,
        }))
    finally:
        cleanup(teacher.id, code)
        await async_engine.dispose()


def main() -> None:
    asyncio.run(run_pipeline())


if __name__ == "__main__":
    main()
