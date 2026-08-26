import io
import json
import stat
import warnings
import zipfile
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, UploadFile

from app.api.v1.endpoints.problems import (
    import_problem,
    upload_problem_package,
    upload_testcases_zip,
)
from app.api.v1.endpoints.workspace import upload_workspace_testcases_zip
from app.services.upload_validation import UploadValidationError, read_upload_bytes


def malicious_zip(kind: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        if kind == "traversal":
            archive.writestr("../escape.in", b"bad")
        elif kind == "symlink":
            info = zipfile.ZipInfo("link")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, "target")
        elif kind == "duplicate":
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                archive.writestr("same.in", b"one")
                archive.writestr("same.in", b"two")
        elif kind == "compression_bomb":
            archive.writestr("bomb.in", b"0" * (1024 * 1024))
        else:
            raise AssertionError(kind)
    return buffer.getvalue()


def upload(data: bytes) -> AsyncMock:
    file = AsyncMock(spec=UploadFile)
    file.filename = "cases.zip"
    file.read.return_value = data
    return file


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "kind", ["traversal", "symlink", "duplicate", "compression_bomb"]
)
@pytest.mark.parametrize(
    "endpoint", ["problem_testcases", "problem_package", "problem_import", "workspace"]
)
async def test_zip_api_boundaries_reject_malicious_archives(kind, endpoint):
    file = upload(malicious_zip(kind))
    db = AsyncMock()
    user = MagicMock(id="teacher-id")

    with pytest.raises(HTTPException) as raised:
        if endpoint == "problem_testcases":
            with patch(
                "app.api.v1.endpoints.problems._get_problem_or_404",
                return_value=MagicMock(id=1),
            ):
                await upload_testcases_zip(
                    "SAFE", file=file, current_user=user, db=db
                )
        elif endpoint == "problem_package":
            await upload_problem_package(
                "SAFE", file=file, current_user=user, db=db
            )
        elif endpoint == "problem_import":
            await import_problem(file=file, current_user=user, db=db)
        else:
            with patch(
                "app.api.v1.endpoints.workspace._write_draft_file"
            ) as write_draft:
                await upload_workspace_testcases_zip(
                    "SAFE", file=file, current_user=user
                )
                write_draft.assert_not_called()

    assert raised.value.status_code == 400
    db.add.assert_not_called()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "metadata",
    [
        b"{not-json",
        json.dumps(["not", "an", "object"]).encode(),
        json.dumps({"code": "../unsafe"}).encode(),
        json.dumps({"code": "SAFE", "test_cases": ["not-an-object"]}).encode(),
    ],
)
async def test_problem_import_rejects_invalid_json_before_db_write(metadata):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("problem.json", metadata)
    db = AsyncMock()

    with pytest.raises(HTTPException) as raised:
        await import_problem(
            file=upload(buffer.getvalue()),
            current_user=MagicMock(id="teacher-id"),
            db=db,
        )

    assert raised.value.status_code == 400
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_bounded_upload_reader_rejects_before_parser():
    file = AsyncMock()
    file.read.return_value = b"12345"
    with pytest.raises(UploadValidationError):
        await read_upload_bytes(file, 4)
    file.read.assert_awaited_once_with(5)
