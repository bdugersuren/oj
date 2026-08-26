from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.auth import UserRegisterIn, register
from app.models.user import UserRole


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [UserRole.TEACHER, UserRole.ADMIN])
async def test_public_registration_rejects_privileged_roles(role):
    db = AsyncMock()

    with pytest.raises(HTTPException) as raised:
        await register(
            UserRegisterIn(
                username=f"blocked-{role.value}",
                email=f"blocked-{role.value}@example.com",
                password="StrongPass123!",
                role=role,
            ),
            db=db,
        )

    assert raised.value.status_code == 403
    db.execute.assert_not_awaited()
