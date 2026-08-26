import pytest
from jose import JWTError

from app.core.config import settings
from app.core.encryption import decrypt_value, encrypt_value
from app.core.security import create_access_token, decode_token, refresh_token_expires_at


def test_jwt_rotation_does_not_break_encrypted_values(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", "jwt-key-before-rotation")
    monkeypatch.setattr(settings, "ENCRYPTION_KEY", "stable-data-encryption-key")
    monkeypatch.setattr(settings, "ENCRYPTION_KEY_PREVIOUS", None)
    token = create_access_token("42", "student")
    encrypted = encrypt_value("smtp-password")

    monkeypatch.setattr(settings, "SECRET_KEY", "jwt-key-after-rotation")

    assert decrypt_value(encrypted) == "smtp-password"
    with pytest.raises(JWTError):
        decode_token(token)


def test_previous_encryption_key_supports_controlled_rotation(monkeypatch):
    monkeypatch.setattr(settings, "ENCRYPTION_KEY", "old-encryption-key")
    monkeypatch.setattr(settings, "ENCRYPTION_KEY_PREVIOUS", None)
    old_ciphertext = encrypt_value("smtp-password")

    monkeypatch.setattr(settings, "ENCRYPTION_KEY", "new-encryption-key")
    monkeypatch.setattr(settings, "ENCRYPTION_KEY_PREVIOUS", "old-encryption-key")

    assert decrypt_value(old_ciphertext) == "smtp-password"
    new_ciphertext = encrypt_value("smtp-password")

    monkeypatch.setattr(settings, "ENCRYPTION_KEY", "old-encryption-key")
    monkeypatch.setattr(settings, "ENCRYPTION_KEY_PREVIOUS", None)
    assert decrypt_value(new_ciphertext) == ""


def test_refresh_expiry_remains_compatible_with_naive_database_datetime():
    assert refresh_token_expires_at().tzinfo is None
