import pytest
import io
import zipfile
import json
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException, UploadFile
from app.api.v1.endpoints.problems import export_problem, import_problem
from app.models.problem import OlympiadScope, DivisionCategory

@pytest.mark.asyncio
async def test_export_problem_success():
    mock_db = AsyncMock()
    mock_problem = MagicMock()
    mock_problem.code = "TEST1"
    mock_problem.title = "Test Problem 1"
    mock_problem.time_limit = 1.0
    mock_problem.memory_limit = 64
    mock_problem.points = 10
    mock_problem.xp_reward = 20
    mock_problem.difficulty.value = "Bronze"
    mock_problem.topic = "Math"
    mock_problem.olympiad_scope.value = OlympiadScope.DISTRICT_SCHOOL.value
    mock_problem.division.value = DivisionCategory.JUNIOR.value
    mock_problem.olympiad_year = 2026
    mock_problem.source_citation = "Custom"
    
    mock_tc = MagicMock()
    mock_tc.order = 1
    mock_tc.points = 10
    mock_tc.is_sample = True
    mock_tc.input_data = "1 2"
    mock_tc.output_data = "3"
    
    mock_hint = MagicMock()
    mock_hint.level = 1
    mock_hint.title = "Hint 1"
    mock_hint.hint_text = "Add them"
    mock_hint.xp_penalty = 5
    
    mock_problem.test_cases = [mock_tc]
    mock_problem.hints = [mock_hint]
    mock_problem.statement_markdown = "Write a program to add two numbers."
    
    with patch("app.api.v1.endpoints.problems._get_problem_or_404", return_value=mock_problem), \
         patch("app.api.v1.endpoints.problems.storage_client.client.list_objects", return_value=[]):
        res = await export_problem(code="TEST1", current_user=MagicMock(), db=mock_db)
        
        # Read the streaming response body
        body = b""
        async for chunk in res.body_iterator:
            body += chunk
            
        # Verify it's a valid ZIP
        zip_buf = io.BytesIO(body)
        with zipfile.ZipFile(zip_buf, "r") as z:
            assert "problem.json" in z.namelist()
            assert "statement.md" in z.namelist()
            assert "testcases/1.in" in z.namelist()
            
            meta = json.loads(z.read("problem.json").decode("utf-8"))
            assert meta["code"] == "TEST1"
            assert meta["title"] == "Test Problem 1"
            assert len(meta["test_cases"]) == 1
            assert len(meta["hints"]) == 1

@pytest.mark.asyncio
async def test_import_problem_duplicate_code_resolution():
    mock_db = AsyncMock()
    
    # Mocking first problem exists (so we have a conflict), second query returns None
    mock_existing_prob = MagicMock()
    mock_existing_prob.code = "TEST1"
    
    # We mock execute to return a result that returns mock_existing_prob first, and then None
    mock_res_1 = MagicMock()
    mock_res_1.scalar_one_or_none.return_value = mock_existing_prob
    
    mock_res_2 = MagicMock()
    mock_res_2.scalar_one_or_none.return_value = None
    
    mock_db.execute.side_effect = [mock_res_1, mock_res_2]
    
    # Construct a valid upload ZIP file in memory
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w") as z:
        prob_meta = {
            "title": "Imported Test",
            "code": "TEST1",
            "time_limit": 1.0,
            "memory_limit": 64,
            "points": 10,
            "xp_reward": 20,
            "difficulty": "Bronze",
            "topic": "Math",
            "olympiad_scope": OlympiadScope.DISTRICT_SCHOOL.value,
            "division": DivisionCategory.JUNIOR.value,
            "hints": [],
            "test_cases": []
        }
        z.writestr("problem.json", json.dumps(prob_meta))
        z.writestr("statement.md", "Sample Statement")
        
    zip_buf.seek(0)
    
    mock_file = MagicMock(spec=UploadFile)
    mock_file.read = AsyncMock(return_value=zip_buf.read())
    
    mock_user = MagicMock()
    mock_user.id = 42
    
    # Patch MinIO upload
    with patch("app.api.v1.endpoints.problems.storage_client.client.put_object"):
        res = await import_problem(file=mock_file, current_user=mock_user, db=mock_db)
        
        # Verify unique_code resolved as TEST1_1 due to duplicate
        assert res["code"] == "TEST1_1"
        assert res["title"] == "Imported Test"
