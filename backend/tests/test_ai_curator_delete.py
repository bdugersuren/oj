import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi import HTTPException
from app.api.v1.endpoints.ai_curator import delete_curated_data

@pytest.mark.asyncio
async def test_delete_curated_data_success():
    mock_db = AsyncMock()
    mock_entry = MagicMock()
    mock_entry.id = 5
    mock_entry.qdrant_point_id = "point-123"
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = mock_entry
    mock_db.execute.return_value = mock_result
    
    # Mock Qdrant deletion directly on the service instance
    with patch("app.services.qdrant_service.qdrant_service.delete_document") as mock_delete_doc:
        res = await delete_curated_data(id=5, current_user=MagicMock(), db=mock_db)
        
        # Assertions
        mock_delete_doc.assert_called_once_with("point-123")
        mock_db.delete.assert_called_once_with(mock_entry)
        mock_db.commit.assert_called_once()
        assert res is None

@pytest.mark.asyncio
async def test_delete_curated_data_not_found():
    mock_db = AsyncMock()
    
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_db.execute.return_value = mock_result
    
    with pytest.raises(HTTPException) as exc_info:
        await delete_curated_data(id=99, current_user=MagicMock(), db=mock_db)
        
    assert exc_info.value.status_code == 404
    assert "Материал олдсонгүй." in exc_info.value.detail
