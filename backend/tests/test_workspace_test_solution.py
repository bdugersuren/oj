import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.v1.endpoints.workspace import (
    GeneratePayload,
    generate_workspace_testcases,
    verify_workspace_solution,
)


class MockUser:
    def __init__(self, user_id):
        self.id = user_id


@pytest.mark.asyncio
async def test_workspace_test_solution_creates_persistent_queue_job():
    user = MockUser("0d9ff2db-34d5-4dc3-ae07-444d985ed896")
    db = AsyncMock()
    db.add = MagicMock()

    async def assign_id(job):
        job.id = 42

    db.refresh.side_effect = assign_id
    with patch("app.api.v1.endpoints.workspace.celery_app.send_task") as send_task:
        response = await verify_workspace_solution(code="testprob", current_user=user, db=db)

    assert response == {
        "job_id": 42,
        "status": "QUEUED",
        "poll_url": "/api/v1/workspace/judge-jobs/42",
    }
    db.add.assert_called_once()
    db.commit.assert_awaited_once()
    send_task.assert_called_once_with(
        "app.workers.judge_worker.execute_workspace_solution",
        args=[42],
        queue="judge_queue",
    )


@pytest.mark.asyncio
async def test_workspace_test_solution_never_compiles_in_api():
    user = MockUser("0d9ff2db-34d5-4dc3-ae07-444d985ed896")
    db = AsyncMock()
    db.add = MagicMock()

    async def assign_id(job):
        job.id = 7

    db.refresh.side_effect = assign_id
    with patch("subprocess.run") as subprocess_run, patch(
        "app.api.v1.endpoints.workspace.celery_app.send_task"
    ):
        response = await verify_workspace_solution(code="TESTPROB", current_user=user, db=db)

    subprocess_run.assert_not_called()
    assert response["status"] == "QUEUED"


@pytest.mark.asyncio
async def test_workspace_generator_creates_persistent_queue_job():
    user = MockUser("0d9ff2db-34d5-4dc3-ae07-444d985ed896")
    db = AsyncMock()
    db.add = MagicMock()

    async def assign_id(job):
        job.id = 43

    db.refresh.side_effect = assign_id
    with patch("subprocess.run") as subprocess_run, patch(
        "app.api.v1.endpoints.workspace.celery_app.send_task"
    ) as send_task:
        response = await generate_workspace_testcases(
            code="sum",
            payload=GeneratePayload(params=["10 20", '"two words" 7'], points_per_case=15),
            current_user=user,
            db=db,
        )

    subprocess_run.assert_not_called()
    job = db.add.call_args.args[0]
    assert job.kind == "generate_testcases"
    assert job.request_payload == {"params": ["10 20", '"two words" 7'], "points_per_case": 15}
    assert response["job_id"] == 43
    send_task.assert_called_once_with(
        "app.workers.judge_worker.execute_workspace_generator",
        args=[43],
        queue="judge_queue",
    )


@pytest.mark.asyncio
async def test_workspace_generator_rejects_unbounded_parameter_rows():
    with pytest.raises(Exception) as exc_info:
        await generate_workspace_testcases(
            code="sum",
            payload=GeneratePayload(params=["x"] * 21, points_per_case=10),
            current_user=MockUser("0d9ff2db-34d5-4dc3-ae07-444d985ed896"),
            db=AsyncMock(),
        )

    assert getattr(exc_info.value, "status_code", None) == 422
