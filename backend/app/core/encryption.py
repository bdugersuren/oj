import base64
import hashlib

from cryptography.fernet import Fernet
from cryptography.fernet import InvalidToken

from app.core.config import settings


def _get_fernet_key(secret: str) -> bytes:
    key_hash = hashlib.sha256(secret.encode()).digest()
    return base64.urlsafe_b64encode(key_hash)


def _primary_secret() -> str:
    # Development compatibility only. Production validation requires the
    # independent ENCRYPTION_KEY setting.
    return settings.ENCRYPTION_KEY or settings.SECRET_KEY


def encrypt_value(value: str) -> str:
    if not value:
        return ""
    try:
        f = Fernet(_get_fernet_key(_primary_secret()))
        return f.encrypt(value.encode()).decode()
    except Exception:
        return ""


def decrypt_value(token: str) -> str:
    if not token:
        return ""
    candidates = [_primary_secret()]
    if (
        settings.ENCRYPTION_KEY_PREVIOUS
        and settings.ENCRYPTION_KEY_PREVIOUS not in candidates
    ):
        candidates.append(settings.ENCRYPTION_KEY_PREVIOUS)
    try:
        for secret in candidates:
            try:
                return Fernet(_get_fernet_key(secret)).decrypt(token.encode()).decode()
            except InvalidToken:
                continue
    except Exception:
        return ""
    return ""
