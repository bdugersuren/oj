"""End-to-end smoke for API dispatch, Celery, Redis, DMOJ, and PostgreSQL."""
import asyncio
import json
import os
import time
import uuid
from types import SimpleNamespace

import redis
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.submissions import SubmissionCreate, submit_code
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine as async_engine
from app.models.problem import Problem, TestCase
from app.models.progression import StudentLevel, StudentProgress
from app.models.gamification import Achievement
from app.models.submission import JudgeResult, Submission, SubmissionStatus
from app.models.user import User, UserRole


SYNC_DATABASE_URL = settings.DATABASE_URL.replace("+asyncpg", "")
Session = sessionmaker(bind=create_engine(SYNC_DATABASE_URL, pool_pre_ping=True))


def seed() -> tuple[uuid.UUID, int, int, str]:
    suffix = uuid.uuid4().hex[:10]
    with Session.begin() as db:
        level = StudentLevel(
            name=f"Pipeline-{suffix}",
            min_xp=0,
            required_solved=0,
            order=1,
        )
        db.add(level)
        db.flush()
        user = User(
            email=f"pipeline-{suffix}@example.invalid",
            username=f"pipe_{suffix}",
            hashed_password="not-used",
            role=UserRole.STUDENT,
            is_active=True,
            is_verified=True,
        )
        db.add(user)
        db.flush()
        db.add(StudentProgress(user_id=user.id, current_level_id=level.id))
        code = f"PIPE{suffix}".upper()
        problem = Problem(
            code=code,
            title="Pipeline smoke",
            statement_markdown="Double the input.",
            time_limit=1.0,
            memory_limit=64,
            points=20,
            xp_reward=20,
            is_visible=True,
        )
        db.add(problem)
        db.flush()
        db.add_all([
            TestCase(
                problem_id=problem.id,
                input_data="2\n",
                output_data="4\n",
                points=10,
                order=1,
                is_sample=True,
            ),
            TestCase(
                problem_id=problem.id,
                input_data="7\n",
                output_data="14\n",
                points=10,
                order=2,
                is_sample=False,
            ),
        ])
        return user.id, problem.id, level.id, code


def cleanup(user_id: uuid.UUID, problem_id: int, level_id: int) -> None:
    with Session.begin() as db:
        problem = db.get(Problem, problem_id)
        if problem is not None:
            db.delete(problem)
        user = db.get(User, user_id)
        if user is not None:
            db.delete(user)
        db.flush()
        level = db.get(StudentLevel, level_id)
        if level is not None:
            db.delete(level)


async def dispatch(user_id: uuid.UUID, code: str) -> int:
    async with AsyncSessionLocal() as db:
        response = await submit_code(
            SubmissionCreate(
                problem_code=code,
                language="g++20",
                source_code=(
                    "#include <iostream>\n"
                    "int main(){long long x;std::cin>>x;std::cout<<x*2<<'\\n';}"
                ),
            ),
            current_user=SimpleNamespace(id=user_id, role=UserRole.STUDENT),
            db=db,
        )
        assert response["status"] == "PENDING", response
        return int(response["submission_id"])


def wait_for_final(
    submission_id: int,
    pubsub,
    *,
    timeout: float = 90,
) -> tuple[SubmissionStatus, dict | None, bool]:
    deadline = time.monotonic() + timeout
    event = None
    saw_retry = False
    final_status = None
    while time.monotonic() < deadline:
        message = pubsub.get_message(ignore_subscribe_messages=True, timeout=0.1)
        if message:
            event = json.loads(message["data"])
        with Session() as db:
            submission = db.get(Submission, submission_id)
            if (
                submission.status == SubmissionStatus.PENDING
                and submission.error_log
            ):
                saw_retry = True
            if submission.status not in {
                SubmissionStatus.PENDING,
                SubmissionStatus.RUNNING,
            }:
                final_status = submission.status
        if final_status is not None and event is not None:
            return final_status, event, saw_retry
        time.sleep(0.1)
    raise TimeoutError(
        f"Submission {submission_id} incomplete: status={final_status}, event={event}"
    )


def assert_single_award(
    user_id: uuid.UUID,
    submission_id: int,
    expected_xp: int,
    *,
    expected_attempts: int,
    expected_solved: int,
) -> None:
    with Session() as db:
        submission = db.get(Submission, submission_id)
        results = (
            db.query(JudgeResult)
            .filter(JudgeResult.submission_id == submission_id)
            .order_by(JudgeResult.testcase_id)
            .all()
        )
        progress = (
            db.query(StudentProgress)
            .filter(StudentProgress.user_id == user_id)
            .one()
        )
        assert submission.status == SubmissionStatus.ACCEPTED
        assert submission.score == 20
        assert submission.judge_attempt == expected_attempts
        assert submission.judge_lease_expires_at is None
        assert submission.judge_started_at is not None
        assert submission.judge_finished_at is not None
        assert submission.rewards_applied_at is not None
        assert [result.status for result in results] == [
            SubmissionStatus.ACCEPTED,
            SubmissionStatus.ACCEPTED,
        ]
        assert progress.total_xp == expected_xp, {
            "expected_xp": expected_xp,
            "actual_xp": progress.total_xp,
            "solved_count": progress.solved_count,
        }
        assert progress.solved_count == expected_solved, {
            "expected_solved": expected_solved,
            "actual_solved": progress.solved_count,
            "total_xp": progress.total_xp,
        }


async def run_pipeline() -> None:
    redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    redis_client.ping()
    user_id, problem_id, level_id, code = seed()
    with Session() as db:
        first_ac = db.query(Achievement).filter(Achievement.code == "FIRST_AC").one_or_none()
        first_ac_bonus = first_ac.xp_bonus if first_ac is not None else 0
    require_bridge_retry = os.getenv("REQUIRE_BRIDGE_RETRY", "false").lower() == "true"

    try:
        # Force the first round-robin acquisition to choose the healthy second host.
        redis_client.set("dmoj:bridge:round_robin", 0)
        healthy_host = settings.DMOJ_BRIDGE_HOSTS.split(",")[-1].strip()
        bridge_blocker = redis_client.lock(
            f"dmoj:bridge:lease:{healthy_host}",
            timeout=120,
            blocking=False,
            thread_local=False,
        )
        assert bridge_blocker.acquire(blocking=False)
        first_id = await dispatch(user_id, code)
        first_pubsub = redis_client.pubsub()
        first_pubsub.subscribe(f"submission:{first_id}")
        # Wait for Redis to acknowledge the subscription before grading can finish.
        first_pubsub.get_message(timeout=1)
        # Duplicate delivery while the original job is pending/running must not
        # create duplicate JudgeResult or XP rows.
        celery_app.send_task(
            "app.workers.judge_worker.execute_submission",
            args=[first_id],
            queue="judge_queue",
        )
        bridge_blocker.release()
        first_status, first_event, _ = wait_for_final(first_id, first_pubsub)
        assert first_status == SubmissionStatus.ACCEPTED
        assert first_event and first_event["status"] == "AC", first_event
        assert_single_award(
            user_id,
            first_id,
            20 + first_ac_bonus,
            expected_attempts=1,
            expected_solved=1,
        )

        # A stale delivery after finalization must also be a no-op.
        celery_app.send_task(
            "app.workers.judge_worker.execute_submission",
            args=[first_id],
            queue="judge_queue",
        )
        time.sleep(1)
        assert_single_award(
            user_id,
            first_id,
            20 + first_ac_bonus,
            expected_attempts=1,
            expected_solved=1,
        )
        first_pubsub.close()

        # Select the next host. Isolated failure-recovery runs may inject a dead
        # first host and set REQUIRE_BRIDGE_RETRY=true; a normal local stack has
        # two healthy bridges and only requires an exactly-once final result.
        redis_client.set("dmoj:bridge:round_robin", -1)
        retry_id = await dispatch(user_id, code)
        retry_pubsub = redis_client.pubsub()
        retry_pubsub.subscribe(f"submission:{retry_id}")
        retry_status, retry_event, saw_retry = wait_for_final(retry_id, retry_pubsub)
        assert retry_status == SubmissionStatus.ACCEPTED
        if require_bridge_retry:
            assert saw_retry, "Expected to observe a fail-closed PENDING retry"
        assert retry_event and retry_event["status"] == "AC", retry_event
        assert_single_award(
            user_id,
            retry_id,
            40 + first_ac_bonus,
            expected_attempts=2 if saw_retry else 1,
            expected_solved=2,
        )
        retry_pubsub.close()
        print(json.dumps({
            "status": "AC",
            "first_submission": first_id,
            "retry_submission": retry_id,
            "duplicate_award": False,
            "bridge_retry_observed": saw_retry,
            "pubsub_received": True,
            "fixture_cleanup": True,
        }))
    finally:
        cleanup(user_id, problem_id, level_id)
        redis_client.close()
        await async_engine.dispose()


def main() -> None:
    asyncio.run(run_pipeline())


if __name__ == "__main__":
    main()
