import base64
import hashlib
from cryptography.fernet import Fernet
from app.core.config import settings


def _get_fernet_key() -> bytes:
    # Hash the SECRET_KEY to get exactly 32 bytes
    key_hash = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return base64.urlsafe_b64encode(key_hash)


def encrypt_value(value: str) -> str:
    if not value:
        return ""
    try:
        f = Fernet(_get_fernet_key())
        return f.encrypt(value.encode()).decode()
    except Exception:
        return ""


def decrypt_value(token: str) -> str:
    if not token:
        return ""
    try:
        f = Fernet(_get_fernet_key())
        return f.decrypt(token.encode()).decode()
    except Exception:
        return ""
