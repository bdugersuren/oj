import io
import zipfile
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException, UploadFile
from app.api.v1.endpoints.workspace import upload_workspace_testcases_zip

def create_mock_zip(files):
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        for file_name, data in files.items():
            zip_file.writestr(file_name, data)
    zip_buffer.seek(0)
    return zip_buffer.getvalue()

@pytest.mark.asyncio
async def test_upload_workspace_testcases_zip_success():
    files = {
        "1.in": "5\n",
        "1.out": "10\n",
        "2.in": "6\n",
        "2.out": "12\n",
        "init.yml": "time_limit: 2.0\nmemory_limit: 128\ntest_cases:\n  - {in: cases/1.in, out: cases/1.out, points: 5, sample: true}\n  - {in: cases/2.in, out: cases/2.out, points: 5}\n"
    }
    zip_bytes = create_mock_zip(files)
    
    mock_file = AsyncMock(spec=UploadFile)
    mock_file.filename = "cases.zip"
    mock_file.read.return_value = zip_bytes
    
    mock_user = MagicMock()
    mock_user.id = "user-123"
    
    written_files = {}
    def mock_write(user_id, code, filename, content):
        written_files[filename] = content

    with patch("app.api.v1.endpoints.workspace._write_draft_file", side_effect=mock_write):
        res = await upload_workspace_testcases_zip(
            code="HELLO",
            file=mock_file,
            points_per_case=10,
            current_user=mock_user
        )
        
        assert res["status"] == "success"
        assert res["count"] == 2
        
        # Verify cases files written
        assert "cases/1.in" in written_files
        assert written_files["cases/1.in"] == "5\n"
        assert "cases/2.out" in written_files
        assert written_files["cases/2.out"] == "12\n"
        
        # Verify init.yml content
        assert "init.yml" in written_files
        init_content = written_files["init.yml"]
        assert "time_limit: 2.0" in init_content
        assert "memory_limit: 128" in init_content
        assert "points: 5" in init_content
        assert "sample: true" in init_content

@pytest.mark.asyncio
async def test_upload_workspace_testcases_zip_no_yml():
    # Only inputs/outputs in cases subfolder
    files = {
        "cases/10.in": "10-in",
        "cases/10.out": "10-out",
        "cases/2.in": "2-in",
        "cases/2.out": "2-out",
    }
    zip_bytes = create_mock_zip(files)
    
    mock_file = AsyncMock(spec=UploadFile)
    mock_file.filename = "cases.zip"
    mock_file.read.return_value = zip_bytes
    
    mock_user = MagicMock()
    mock_user.id = "user-123"
    
    written_files = {}
    def mock_write(user_id, code, filename, content):
        written_files[filename] = content

    with patch("app.api.v1.endpoints.workspace._write_draft_file", side_effect=mock_write):
        res = await upload_workspace_testcases_zip(
            code="HELLO",
            file=mock_file,
            points_per_case=15,
            current_user=mock_user
        )
        
        assert res["status"] == "success"
        assert res["count"] == 2
        
        # Sorting check: 2 should be index 1, 10 should be index 2
        assert "cases/1.in" in written_files
        assert written_files["cases/1.in"] == "2-in"
        assert "cases/2.in" in written_files
        assert written_files["cases/2.in"] == "10-in"
        
        # Default yml check
        assert "init.yml" in written_files
        init_content = written_files["init.yml"]
        assert "time_limit: 1.0" in init_content
        assert "memory_limit: 64" in init_content
        # First case should have 15 points and sample: true
        assert "points: 15, sample: true" in init_content
        # Second case should have 15 points
        assert "points: 15" in init_content

@pytest.mark.asyncio
async def test_upload_workspace_testcases_zip_invalid_file():
    mock_file = MagicMock(spec=UploadFile)
    mock_file.filename = "cases.rar" # not .zip
    
    with pytest.raises(HTTPException) as exc_info:
        await upload_workspace_testcases_zip(
            code="HELLO",
            file=mock_file,
            points_per_case=10,
            current_user=MagicMock()
        )
    assert exc_info.value.status_code == 400
    assert "Зөвхөн ZIP архив" in exc_info.value.detail

@pytest.mark.asyncio
async def test_workspace_invalid_yaml_publish():
    from app.api.v1.endpoints.workspace import publish_workspace
    
    # Mock database session
    mock_db = AsyncMock()
    mock_problem = MagicMock()
    mock_problem.id = 1
    mock_problem.code = "BS2025L01P001"
    mock_problem.testcases_zip_key = None
    
    # Mock executing queries
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_problem
    mock_db.execute.return_value = mock_result
    
    # Invalid YAML indentation content reported in user issue
    invalid_yml = """
archive: cases.zip
time_limit: 1.0
memory_limit: 64
test_cases:
  - points: 1
    cases:
  - {in: cases/1.in, out: cases/1.out, sample: true}
  - {in: cases/2.in, out: cases/2.out}
"""
    
    def mock_read(user_id, code, filename):
        if filename == "init.yml":
            return invalid_yml
        return "mock data"
        
    mock_user = MagicMock()
    mock_user.id = "user-123"
    
    mock_storage = MagicMock()
    mock_storage.upload_file = AsyncMock()
    
    # Mock external calls
    with patch("app.api.v1.endpoints.workspace._read_draft_file", side_effect=mock_read), \
         patch("app.api.v1.endpoints.workspace._list_draft_files", return_value=["init.yml", "cases/1.in", "cases/1.out"]), \
         patch("app.api.v1.endpoints.workspace._read_draft_file_bytes", return_value=b"testcases"), \
         patch("app.api.v1.endpoints.workspace._delete_draft_prefix") as mock_delete, \
         patch("app.api.v1.endpoints.workspace.storage_client", mock_storage):
         
        # We don't want publish_workspace to raise TypeError or crashes
        # It should run through and return status: success or normal HTTPException
        from app.api.v1.endpoints.workspace import PublishPayload
        payload = PublishPayload(title="Test Problem", time_limit=1.0, memory_limit=64)
        
        res = await publish_workspace(
            code="BS2025L01P001",
            payload=payload,
            db=mock_db,
            current_user=mock_user
        )
        assert res["status"] == "success"




