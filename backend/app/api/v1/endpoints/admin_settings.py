from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.system_setting import SystemSetting
from app.core.encryption import encrypt_value, decrypt_value

router = APIRouter()


class EmailSettingsIn(BaseModel):
    smtp_host:       str
    smtp_port:       int
    smtp_user:       str
    smtp_password:   Optional[str] = None  # None гэвэл хуучин нууц үгийг хэвээр үлдээнэ
    smtp_use_tls:    bool
    smtp_from_email: EmailStr
    smtp_from_name:  str
    smtp_enabled:    bool


class EmailSettingsOut(BaseModel):
    smtp_host:       str
    smtp_port:       int
    smtp_user:       str
    smtp_use_tls:    bool
    smtp_from_email: str
    smtp_from_name:  str
    smtp_enabled:    bool


async def _save_setting(db: AsyncSession, key: str, value: str, description: str = None):
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = value
        if description:
            setting.description = description
    else:
        setting = SystemSetting(key=key, value=value, description=description)
        db.add(setting)


@router.get(
    "/email",
    response_model=EmailSettingsOut,
    summary="Админы SMTP тохиргоог унших",
)
async def get_email_settings(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_role("admin")),
):
    result = await db.execute(select(SystemSetting))
    db_settings = {s.key: s.value for s in result.scalars().all()}

    return EmailSettingsOut(
        smtp_host=db_settings.get("smtp_host", ""),
        smtp_port=int(db_settings.get("smtp_port", 587)),
        smtp_user=db_settings.get("smtp_user", ""),
        smtp_use_tls=(db_settings.get("smtp_use_tls") == "true"),
        smtp_from_email=db_settings.get("smtp_from_email", ""),
        smtp_from_name=db_settings.get("smtp_from_name", "OJ Platform"),
        smtp_enabled=(db_settings.get("smtp_enabled") == "true"),
    )


@router.put(
    "/email",
    summary="Админы SMTP тохиргоог шинэчлэх (нууц үгийг шифрлэх)",
)
async def update_email_settings(
    payload: EmailSettingsIn,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(require_role("admin")),
):
    await _save_setting(db, "smtp_host", payload.smtp_host, "SMTP host address")
    await _save_setting(db, "smtp_port", str(payload.smtp_port), "SMTP port number")
    await _save_setting(db, "smtp_user", payload.smtp_user, "SMTP username")
    await _save_setting(db, "smtp_use_tls", "true" if payload.smtp_use_tls else "false", "Use TLS/SSL")
    await _save_setting(db, "smtp_from_email", payload.smtp_from_email, "Sender email address")
    await _save_setting(db, "smtp_from_name", payload.smtp_from_name, "Sender name")
    await _save_setting(db, "smtp_enabled", "true" if payload.smtp_enabled else "false", "Enable email features")

    if payload.smtp_password:
        # Cryptography ашиглан хоёр талын шифрлэлтээр нууц үгийг хадгалах
        encrypted_pw = encrypt_value(payload.smtp_password)
        await _save_setting(db, "smtp_password", encrypted_pw, "Encrypted SMTP password")

    await db.commit()
    return {"message": "И-мэйл SMTP тохиргоо амжилттай хадгалагдлаа."}


@router.get(
    "/judges/health",
    summary="Шүүгч серверүүдийн (DMOJ Bridge) холболтыг шалгах",
)
async def check_judges_health(
    current_user = Depends(require_role("admin", "teacher")),
):
    import socket
    from app.core.config import settings

    hosts = settings.DMOJ_BRIDGE_HOSTS.split(",")
    results = []
    
    for host in hosts:
        host = host.strip()
        if not host:
            continue
        healthy = False
        error_msg = None
        try:
            # Quick TCP connection check
            s = socket.create_connection((host, settings.DMOJ_BRIDGE_PORT), timeout=1.0)
            s.close()
            healthy = True
        except Exception as e:
            error_msg = str(e)
            
        results.append({
            "host": host,
            "port": settings.DMOJ_BRIDGE_PORT,
            "status": "online" if healthy else "offline",
            "error": error_msg
        })
        
    return results
