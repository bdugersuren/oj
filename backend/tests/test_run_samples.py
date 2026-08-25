import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from app.api.v1.endpoints.problems import run_samples, RunSamplesRequest

@pytest.mark.asyncio
async def test_run_samples_is_disabled_in_favour_of_queue():
    mock_db = AsyncMock()
    mock_problem = MagicMock()
    mock_problem.id = 1
    mock_problem.code = "TEST101"
    
    # Correct mock for DB execute returning empty list
    mock_result = MagicMock()
    mock_result.scalars.return_value.all.return_value = []
    mock_db.execute.return_value = mock_result
    
    req = RunSamplesRequest(language="cpp", source_code="int main() {}")
    
    with pytest.raises(HTTPException) as exc_info:
        await run_samples(code="TEST101", req=req, db=mock_db, current_user=MagicMock())
    assert exc_info.value.status_code == 410
    assert "is_sample_test=true" in exc_info.value.detail
