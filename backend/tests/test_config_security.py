import pytest
from pydantic import ValidationError

from app.core.config import Settings


def production_settings(**overrides):
    values = {
        "ENVIRONMENT": "production",
        "SECRET_KEY": "production-secret-with-at-least-32-random-characters",
        "DATABASE_URL": "postgresql+asyncpg://oj_user:nondefault-db-secret@db:5432/oj_db",
        "MINIO_ROOT_PASSWORD": "nondefault-minio-secret",
        "DMOJ_JUDGE_KEY": "nondefault-dmoj-secret",
        "COOKIE_SECURE": True,
        "CORS_ORIGINS": "https://oj.example.edu",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("SECRET_KEY", "change-me-in-production"),
        ("DATABASE_URL", "postgresql+asyncpg://oj_user:oj_secure_password_2026@db/oj_db"),
        ("MINIO_ROOT_PASSWORD", "minioadmin_secure_2026"),
        ("DMOJ_JUDGE_KEY", "dmoj_judge_auth_secret_key_2026"),
    ],
)
def test_production_rejects_default_secrets(field, value):
    with pytest.raises(ValidationError):
        production_settings(**{field: value})


def test_production_requires_secure_cookie():
    with pytest.raises(ValidationError):
        production_settings(COOKIE_SECURE=False)


def test_production_requires_safe_judge_lease_duration():
    with pytest.raises(ValidationError):
        production_settings(JUDGE_LEASE_SECONDS=5)


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:3000", "https://127.0.0.1", "http://oj.example.edu"],
)
def test_production_rejects_local_cors(origin):
    with pytest.raises(ValidationError):
        production_settings(CORS_ORIGINS=origin)


def test_production_accepts_explicit_secure_configuration():
    configured = production_settings()
    assert configured.COOKIE_SECURE is True
    assert configured.CORS_ORIGINS == "https://oj.example.edu"
