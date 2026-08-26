"""Re-encrypt database-backed secrets with the current ENCRYPTION_KEY."""
import asyncio

from sqlalchemy import select

from app.core.config import settings
from app.core.database import AsyncSessionLocal, engine
from app.core.encryption import decrypt_value, encrypt_value
from app.models.system_setting import SystemSetting


async def rotate() -> None:
    if not settings.ENCRYPTION_KEY:
        raise RuntimeError("ENCRYPTION_KEY is required")
    if not settings.ENCRYPTION_KEY_PREVIOUS:
        raise RuntimeError("ENCRYPTION_KEY_PREVIOUS is required during rotation")
    if settings.ENCRYPTION_KEY == settings.ENCRYPTION_KEY_PREVIOUS:
        raise RuntimeError("Current and previous encryption keys must differ")

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(SystemSetting).where(SystemSetting.key == "smtp_password")
        )
        setting = result.scalar_one_or_none()
        if setting is None:
            print("No encrypted SMTP setting exists; nothing to rotate")
            return
        plaintext = decrypt_value(setting.value)
        if not plaintext:
            raise RuntimeError(
                "SMTP password cannot be decrypted with current or previous key"
            )
        replacement = encrypt_value(plaintext)
        if not replacement or replacement == setting.value:
            raise RuntimeError("Failed to create replacement ciphertext")
        setting.value = replacement
        await session.commit()
        print("Encrypted SMTP setting rotated successfully")


async def main() -> None:
    try:
        await rotate()
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
