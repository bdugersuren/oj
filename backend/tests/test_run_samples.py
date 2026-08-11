import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from app.api.v1.endpoints.problems import run_samples, RunSamplesRequest

@pytest.mark.asyncio
async def test_run_samples_no_testcases():
    mock_db = AsyncMock()
    mock_problem = MagicMock()
    mock_problem.id = 1
    mock_problem.code = "TEST101"
    
    # Correct mock for DB execute returning empty list
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result
    
    req = RunSamplesRequest(language="cpp", source_code="int main() {}")
    
    with patch("app.api.v1.endpoints.problems._get_problem_or_404", return_value=mock_problem):
        with pytest.raises(HTTPException) as exc_info:
            await run_samples(code="TEST101", req=req, db=mock_db, current_user=MagicMock())
        assert exc_info.value.status_code == 400
        assert "жишээ тест оруулаагүй байна" in exc_info.value.detail

@pytest.mark.asyncio
async def test_run_samples_success():
    mock_db = AsyncMock()
    mock_problem = MagicMock()
    mock_problem.id = 1
    mock_problem.code = "TEST101"
    mock_problem.time_limit = 1.0
    mock_problem.memory_limit = 64
    
    mock_tc = MagicMock()
    mock_tc.id = 5
    mock_tc.input_data = "1 2"
    mock_tc.output_data = "3"
    mock_tc.points = 10
    
    # Correct mock for DB execute returning the sample testcase
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = [mock_tc]
    mock_db.execute.return_value = mock_result
    
    req = RunSamplesRequest(language="cpp", source_code="int main() {}")
    
    # Mock grade_submission return verdict
    mock_verdict = {
        "status": "AC",
        "time_ms": 15.0,
        "memory_kb": 1200.0,
        "test_results": [
            {
                "testcase_id": 5,
                "status": "AC",
                "time_ms": 15.0,
                "memory_kb": 1200.0,
                "actual_output": "3",
                "checker_output": "ok"
            }
        ]
    }
    
    with patch("app.api.v1.endpoints.problems._get_problem_or_404", return_value=mock_problem), \
         patch("app.services.local_judge.LocalSubprocessJudge.grade_submission", return_value=mock_verdict):
        res = await run_samples(code="TEST101", req=req, db=mock_db, current_user=MagicMock())
        
        assert res["status"] == "AC"
        assert res["time_ms"] == 15.0
        assert len(res["testcases"]) == 1
        assert res["testcases"][0]["testcase_id"] == 5
        assert res["testcases"][0]["status"] == "AC"
        assert res["testcases"][0]["actual_output"] == "3"
