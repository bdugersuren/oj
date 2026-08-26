import pytest
from pydantic import ValidationError

from app.core.config import Settings, load_secret_file_settings


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


def test_production_rejects_enabled_but_incomplete_smtp():
    with pytest.raises(ValidationError):
        production_settings(SMTP_ENABLED=True, SMTP_HOST="smtp.example.edu")


def test_production_accepts_complete_smtp_configuration():
    configured = production_settings(
        SMTP_ENABLED=True,
        SMTP_HOST="smtp.example.edu",
        SMTP_USER="mailer",
        SMTP_PASSWORD="smtp-secret",
        EMAILS_FROM_EMAIL="noreply@example.edu",
    )
    assert configured.SMTP_ENABLED is True


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


def test_secret_file_setting_overrides_dotenv_source(monkeypatch, tmp_path):
    secret_file = tmp_path / "secret_key"
    secret_file.write_text("file-backed-secret\n", encoding="utf-8")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("SECRET_KEY_FILE", str(secret_file))

    load_secret_file_settings()

    assert Settings(_env_file=None).SECRET_KEY == "file-backed-secret"


def test_secret_file_setting_rejects_direct_environment_duplicate(monkeypatch, tmp_path):
    secret_file = tmp_path / "secret_key"
    secret_file.write_text("file-backed-secret", encoding="utf-8")
    monkeypatch.setenv("SECRET_KEY", "environment-secret")
    monkeypatch.setenv("SECRET_KEY_FILE", str(secret_file))

    with pytest.raises(ValueError, match="either SECRET_KEY or SECRET_KEY_FILE"):
        load_secret_file_settings()


@pytest.mark.parametrize("content", [None, "\n"])
def test_secret_file_setting_rejects_missing_or_empty_file(
    monkeypatch, tmp_path, content
):
    secret_file = tmp_path / "secret_key"
    if content is not None:
        secret_file.write_text(content, encoding="utf-8")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("SECRET_KEY_FILE", str(secret_file))

    with pytest.raises(ValueError, match="secret file for SECRET_KEY|Secret file for SECRET_KEY"):
        load_secret_file_settings()
