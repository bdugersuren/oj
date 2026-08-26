"""Actual ASGI smoke for cookie auth, CSRF, RBAC, refresh, and WebSocket."""
import asyncio
import json
import uuid

import httpx
import websockets
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.problem import Problem
from app.models.submission import JudgeResult, Submission, SubmissionStatus
from app.models.user import User, UserRole
from app.services.storage import storage_client


BASE_URL = "http://127.0.0.1:8000"
SYNC_DATABASE_URL = settings.DATABASE_URL.replace("+asyncpg", "")
Session = sessionmaker(bind=create_engine(SYNC_DATABASE_URL, pool_pre_ping=True))
PASSWORD = "SmokePass123!"


def seed_teacher(suffix: str) -> uuid.UUID:
    with Session.begin() as db:
        teacher = User(
            email=f"asgi-teacher-{suffix}@example.com",
            username=f"asgi_teacher_{suffix}",
            hashed_password=get_password_hash(PASSWORD),
            role=UserRole.TEACHER,
            is_active=True,
            is_verified=True,
        )
        db.add(teacher)
        db.flush()
        return teacher.id


def seed_terminal_submission(student_username: str, code: str) -> tuple[uuid.UUID, int]:
    with Session.begin() as db:
        student = db.query(User).filter(User.username == student_username).one()
        problem = Problem(
            code=code,
            title="ASGI WebSocket smoke",
            statement_markdown="Terminal snapshot smoke.",
            time_limit=1.0,
            memory_limit=64,
            points=10,
            xp_reward=10,
            is_visible=True,
        )
        db.add(problem)
        db.flush()
        submission = Submission(
            user_id=student.id,
            problem_id=problem.id,
            language="g++20",
            source_code="int main(){}",
            status=SubmissionStatus.ACCEPTED,
            score=10,
            time_ms=1.25,
            memory_kb=2048,
            judge_attempt=1,
        )
        db.add(submission)
        db.flush()
        db.add(JudgeResult(
            submission_id=submission.id,
            testcase_id=1,
            status=SubmissionStatus.ACCEPTED,
            time_ms=1.25,
            memory_kb=2048,
            output_log="accepted",
        ))
        return student.id, submission.id


def cookie_header(client: httpx.Client) -> str:
    return "; ".join(f"{name}={value}" for name, value in client.cookies.items())


async def assert_terminal_websocket(
    client: httpx.Client, submission_id: int
) -> None:
    uri = f"ws://127.0.0.1:8000/api/v1/ws/submissions/{submission_id}"
    async with websockets.connect(
        uri,
        additional_headers={"Cookie": cookie_header(client)},
        open_timeout=10,
    ) as websocket:
        connected = json.loads(await asyncio.wait_for(websocket.recv(), timeout=10))
        snapshot = json.loads(await asyncio.wait_for(websocket.recv(), timeout=10))
        assert connected["status"] == "CONNECTED", connected
        assert snapshot["status"] == "AC", snapshot
        assert snapshot["submission_id"] == submission_id, snapshot
        assert len(snapshot["judge_results"]) == 1, snapshot
        assert snapshot["judge_results"][0]["status"] == "AC", snapshot


def cleanup(user_ids: list[uuid.UUID], code: str) -> None:
    for user_id in user_ids:
        prefix = f"{user_id}/{code}/"
        objects = storage_client.client.list_objects(
            "oj-workspace-drafts", prefix=prefix, recursive=True
        )
        for item in objects:
            storage_client.client.remove_object(
                "oj-workspace-drafts", item.object_name
            )
    with Session.begin() as db:
        problem = db.query(Problem).filter(Problem.code == code).one_or_none()
        if problem is not None:
            db.delete(problem)
        for user_id in user_ids:
            user = db.get(User, user_id)
            if user is not None:
                db.delete(user)


async def run_smoke() -> None:
    suffix = uuid.uuid4().hex[:8]
    student_username = f"asgi_student_{suffix}"
    teacher_username = f"asgi_teacher_{suffix}"
    code = f"ASGI{suffix}".upper()
    teacher_id = seed_teacher(suffix)
    student_id = None

    student = httpx.Client(base_url=BASE_URL, timeout=15)
    teacher = httpx.Client(base_url=BASE_URL, timeout=15)
    try:
        escalation = student.post("/api/v1/auth/register", json={
            "username": f"blocked_admin_{suffix}",
            "email": f"blocked-admin-{suffix}@example.com",
            "password": PASSWORD,
            "role": "admin",
        })
        assert escalation.status_code == 403, escalation.text

        registered = student.post("/api/v1/auth/register", json={
            "username": student_username,
            "email": f"asgi-student-{suffix}@example.com",
            "password": PASSWORD,
        })
        assert registered.status_code == 201, registered.text
        with Session() as db:
            student_id = (
                db.query(User.id)
                .filter(User.username == student_username)
                .scalar()
            )
        assert student_id is not None
        logged_in = student.post("/api/v1/auth/login", json={
            "login": student_username,
            "password": PASSWORD,
        })
        assert logged_in.status_code == 200, logged_in.text
        assert student.cookies.get("oj_access"), student.cookies
        assert student.cookies.get("oj_refresh"), student.cookies
        assert student.cookies.get("oj_csrf"), student.cookies

        me = student.get("/api/v1/auth/me")
        assert me.status_code == 200 and me.json()["role"] == "student", me.text
        rejected_csrf = student.patch(
            "/api/v1/auth/me", json={"full_name": "Should fail"}
        )
        assert rejected_csrf.status_code == 403, rejected_csrf.text
        csrf = student.cookies.get("oj_csrf")
        updated = student.patch(
            "/api/v1/auth/me",
            json={"full_name": "ASGI Smoke Student"},
            headers={"x-csrf-token": csrf},
        )
        assert updated.status_code == 200, updated.text

        denied_workspace = student.get(f"/api/v1/workspace/{code}/files")
        assert denied_workspace.status_code == 403, denied_workspace.text

        old_refresh = student.cookies.get("oj_refresh")
        refreshed = student.post(
            "/api/v1/auth/refresh",
            headers={"x-csrf-token": csrf},
        )
        assert refreshed.status_code == 200, refreshed.text
        assert student.cookies.get("oj_refresh") != old_refresh
        csrf = student.cookies.get("oj_csrf")
        replay = student.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": old_refresh},
            headers={"x-csrf-token": csrf},
        )
        assert replay.status_code == 401, replay.text

        teacher_login = teacher.post("/api/v1/auth/login", json={
            "login": teacher_username,
            "password": PASSWORD,
        })
        assert teacher_login.status_code == 200, teacher_login.text
        workspace = teacher.get(f"/api/v1/workspace/{code}/files")
        assert workspace.status_code == 200, workspace.text
        assert "solution.cpp" in workspace.json(), workspace.text

        student_id, submission_id = seed_terminal_submission(
            student_username, code
        )
        await assert_terminal_websocket(student, submission_id)
        await assert_terminal_websocket(teacher, submission_id)

        print(json.dumps({
            "status": "AC",
            "cookie_auth": True,
            "csrf_enforced": True,
            "privilege_escalation_blocked": True,
            "refresh_rotation": True,
            "workspace_rbac": True,
            "terminal_ws_snapshot": True,
        }))
    finally:
        student.close()
        teacher.close()
        cleanup(
            [item for item in (student_id, teacher_id) if item is not None], code
        )


def main() -> None:
    asyncio.run(run_smoke())


if __name__ == "__main__":
    main()
