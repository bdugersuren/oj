from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.submissions import SubmissionCreate, submit_code


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("language", "source"),
    [
        (
            "flowgorithm",
            '<!DOCTYPE program [<!ENTITY x "boom">]><program>&x;</program>',
        ),
        ("scratch", "print('raw prototype bypass')"),
        ("scratch", '{"blocks_xml":"<xml/>"}'),
    ],
)
async def test_visual_submission_rejected_before_db_or_queue(language, source):
    db = AsyncMock()
    with pytest.raises(HTTPException) as raised:
        await submit_code(
            SubmissionCreate(
                problem_code="SAFE",
                language=language,
                source_code=source,
            ),
            current_user=MagicMock(id="student-id"),
            db=db,
        )

    assert raised.value.status_code == 400
    db.execute.assert_not_awaited()
