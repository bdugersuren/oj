"""Coordinator actions for a hard-kill Celery judge recovery smoke test."""
import argparse
import asyncio
import json
import time
from datetime import datetime, timedelta, timezone

from app.core.database import engine as async_engine
from app.models.progression import StudentProgress
from app.models.submission import JudgeResult, Submission, SubmissionStatus
from scripts.smoke_submission_pipeline import Session, dispatch, seed


async def create() -> None:
    user_id, _problem_id, code = seed()
    submission_id = await dispatch(user_id, code)
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        with Session() as db:
            submission = db.get(Submission, submission_id)
            if submission.status == SubmissionStatus.RUNNING:
                print(json.dumps({
                    "submission_id": submission_id,
                    "user_id": str(user_id),
                    "attempt": submission.judge_attempt,
                    "status": submission.status.value,
                }))
                await async_engine.dispose()
                return
        await asyncio.sleep(0.1)
    raise TimeoutError("Submission did not enter RUNNING")


def expire(submission_id: int) -> None:
    with Session.begin() as db:
        submission = db.get(Submission, submission_id)
        assert submission.status == SubmissionStatus.RUNNING
        submission.judge_lease_expires_at = (
            datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
        )
    print(json.dumps({"submission_id": submission_id, "lease": "expired"}))


def verify(submission_id: int) -> None:
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        with Session() as db:
            submission = db.get(Submission, submission_id)
            if submission.status == SubmissionStatus.ACCEPTED:
                results = db.query(JudgeResult).filter(
                    JudgeResult.submission_id == submission_id
                ).all()
                progress = db.query(StudentProgress).filter(
                    StudentProgress.user_id == submission.user_id
                ).one()
                assert submission.judge_attempt == 2
                assert submission.judge_lease_expires_at is None
                assert submission.rewards_applied_at is not None
                assert len(results) == 2
                assert progress.total_xp == 20
                assert progress.solved_count == 1
                print(json.dumps({
                    "status": "AC",
                    "submission_id": submission_id,
                    "attempts": submission.judge_attempt,
                    "judge_results": len(results),
                    "xp": progress.total_xp,
                }))
                return
        time.sleep(0.2)
    raise TimeoutError("Reclaimed submission did not finish")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("create", "expire", "verify"))
    parser.add_argument("submission_id", type=int, nargs="?")
    args = parser.parse_args()
    if args.action == "create":
        asyncio.run(create())
    elif args.action == "expire":
        assert args.submission_id is not None
        expire(args.submission_id)
    else:
        assert args.submission_id is not None
        verify(args.submission_id)


if __name__ == "__main__":
    main()
