"""Actual ASGI negative smoke for archive and visual-source boundaries."""
import io
import json
import uuid
import zipfile

import httpx
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.security import get_password_hash
from app.models.problem import Problem, TestCase
from app.models.submission import Submission
from app.models.user import User, UserRole
from app.services.storage import storage_client


BASE_URL = "http://127.0.0.1:8000"
PASSWORD = "SmokePass123!"
Session = sessionmaker(
    bind=create_engine(
        settings.DATABASE_URL.replace("+asyncpg", ""), pool_pre_ping=True
    )
)


def traversal_zip() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("../escape.in", b"bad")
        archive.writestr("../escape.out", b"bad")
    return buffer.getvalue()


def seed(suffix: str) -> tuple[uuid.UUID, str, str]:
    username = f"upload_teacher_{suffix}"
    code = f"UP{suffix}".upper()
    with Session.begin() as db:
        teacher = User(
            email=f"upload-teacher-{suffix}@example.com",
            username=username,
            hashed_password=get_password_hash(PASSWORD),
            role=UserRole.TEACHER,
            is_active=True,
            is_verified=True,
        )
        db.add(teacher)
        db.flush()
        db.add(Problem(
            code=code,
            title="Upload security smoke",
            statement_markdown="Negative archive smoke.",
            created_by_id=teacher.id,
        ))
        return teacher.id, username, code


def cleanup(teacher_id: uuid.UUID, code: str) -> None:
    for bucket, prefix in (
        (settings.MINIO_BUCKET_PROBLEMS, f"{code}/"),
        ("oj-private-problems", f"{code}/"),
        ("oj-workspace-drafts", f"{teacher_id}/{code}/"),
    ):
        for item in storage_client.client.list_objects(
            bucket, prefix=prefix, recursive=True
        ):
            storage_client.client.remove_object(bucket, item.object_name)
    with Session.begin() as db:
        problem = db.query(Problem).filter(Problem.code == code).one_or_none()
        if problem is not None:
            db.delete(problem)
        teacher = db.get(User, teacher_id)
        if teacher is not None:
            db.delete(teacher)


def main() -> None:
    suffix = uuid.uuid4().hex[:8]
    teacher_id, username, code = seed(suffix)
    client = httpx.Client(base_url=BASE_URL, timeout=20)
    try:
        login = client.post("/api/v1/auth/login", json={
            "login": username,
            "password": PASSWORD,
        })
        assert login.status_code == 200, login.text
        csrf = client.cookies.get("oj_csrf")
        headers = {"x-csrf-token": csrf}
        archive = traversal_zip()
        targets = [
            (f"/api/v1/problems/{code}/testcases/upload-zip", {}),
            ("/api/v1/problems/upload-package", {"code": code}),
            ("/api/v1/problems/import", {}),
            (f"/api/v1/workspace/{code}/upload-testcases-zip", {}),
        ]
        statuses = {}
        for path, params in targets:
            response = client.post(
                path,
                params=params,
                files={"file": ("malicious.zip", archive, "application/zip")},
                headers=headers,
            )
            statuses[path] = response.status_code
            assert response.status_code == 400, (path, response.text)

        for language, source in (
            (
                "flowgorithm",
                '<!DOCTYPE program [<!ENTITY x "boom">]><program>&x;</program>',
            ),
            ("scratch", "print('raw JSON bypass')"),
        ):
            response = client.post(
                "/api/v1/submissions/",
                json={
                    "problem_code": code,
                    "language": language,
                    "source_code": source,
                },
                headers=headers,
            )
            assert response.status_code == 400, response.text

        with Session() as db:
            problem = db.query(Problem).filter(Problem.code == code).one()
            assert db.query(TestCase).filter(TestCase.problem_id == problem.id).count() == 0
            assert db.query(Submission).filter(Submission.problem_id == problem.id).count() == 0

        print(json.dumps({
            "status": "AC",
            "zip_boundaries": statuses,
            "visual_xml_json_rejected": True,
            "db_side_effects": False,
        }))
    finally:
        client.close()
        cleanup(teacher_id, code)


if __name__ == "__main__":
    main()
