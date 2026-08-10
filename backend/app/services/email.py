import smtplib
import asyncio
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.system_setting import SystemSetting
from app.core.config import settings
from app.core.encryption import decrypt_value

logger = logging.getLogger(__name__)


async def get_smtp_config(db: AsyncSession) -> dict:
    """
    Get SMTP settings from the database, fallback to settings if not configured.
    """
    # Fetch all system settings
    result = await db.execute(select(SystemSetting))
    db_settings = {s.key: s.value for s in result.scalars().all()}

    # Resolve settings (DB values override app config)
    return {
        "host": db_settings.get("smtp_host") or getattr(settings, "SMTP_HOST", None),
        "port": int(db_settings.get("smtp_port") or getattr(settings, "SMTP_PORT", 587) or 587),
        "user": db_settings.get("smtp_user") or getattr(settings, "SMTP_USER", None),
        "password": decrypt_value(db_settings.get("smtp_password")) or getattr(settings, "SMTP_PASSWORD", None),
        "use_tls": (db_settings.get("smtp_use_tls") == "true") if "smtp_use_tls" in db_settings else getattr(settings, "SMTP_TLS", True),
        "from_email": db_settings.get("smtp_from_email") or getattr(settings, "EMAILS_FROM_EMAIL", None),
        "from_name": db_settings.get("smtp_from_name") or getattr(settings, "EMAILS_FROM_NAME", "OJ Platform"),
        "enabled": (db_settings.get("smtp_enabled") == "true") if "smtp_enabled" in db_settings else True,
    }


def _send_smtp_sync(config: dict, to_email: str, subject: str, html_content: str):
    """
    Synchronous SMTP email sending. Executed in a separate thread.
    """
    if not config["enabled"]:
        logger.info("Email service is disabled in settings. Skipping mail send.")
        return

    if not config["host"] or not config["user"] or not config["password"]:
        logger.warning("SMTP configuration is missing. Cannot send email.")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{config['from_name']} <{config['from_email']}>"
    msg["To"] = to_email

    msg.attach(MIMEText(html_content, "html"))

    try:
        server = smtplib.SMTP(config["host"], config["port"], timeout=10)
        if config["use_tls"]:
            server.starttls()
        server.login(config["user"], config["password"])
        server.sendmail(config["from_email"], to_email, msg.as_string())
        server.quit()
        logger.info(f"Email successfully sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        raise e


async def send_verification_email(email: str, username: str, token: str, db: AsyncSession):
    config = await get_smtp_config(db)
    
    # Activation Link
    link = f"http://oj.know.mn/auth/verify?token={token}"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                background-color: #0b0f19;
                color: #f3f4f6;
                margin: 0;
                padding: 40px 20px;
            }}
            .container {{
                max-width: 500px;
                margin: 0 auto;
                background: rgba(17, 24, 39, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 24px;
                padding: 40px;
                text-align: center;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            }}
            .logo {{
                font-size: 28px;
                font-weight: 900;
                background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin-bottom: 24px;
            }}
            h1 {{
                font-size: 20px;
                font-weight: 800;
                margin-bottom: 12px;
                color: #ffffff;
            }}
            p {{
                font-size: 14px;
                line-height: 1.6;
                color: #9ca3af;
                margin-bottom: 30px;
            }}
            .btn {{
                display: inline-block;
                padding: 12px 30px;
                font-weight: 700;
                font-size: 14px;
                color: #ffffff !important;
                background: linear-gradient(135deg, #00f2fe 0%, #4facfe 100%);
                text-decoration: none;
                border-radius: 12px;
                box-shadow: 0 4px 14px rgba(0, 242, 254, 0.3);
                transition: transform 0.2s ease;
            }}
            .footer {{
                margin-top: 40px;
                font-size: 11px;
                color: #4b5563;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">OJ PLATFORM</div>
            <h1>Бүртгэл баталгаажуулах</h1>
            <p>Сайн байна уу, <b>{username}</b>!<br>OJ Platform-д бүртгүүлсэнд баярлалаа. Бүртгэлээ идэвхжүүлж суралцах аяллаа эхлэхийн тулд доорх товчлуур дээр дарна уу.</p>
            <a href="{link}" class="btn">Бүртгэл Идэвхжүүлэх</a>
            <p style="margin-top: 30px; font-size: 11px; color: #6b7280;">Хэрэв товчлуур ажиллахгүй бол дараах холбоосыг хөтөч дээрээ хуулж орно уу:<br><span style="word-break: break-all; color: #00f2fe;">{link}</span></p>
            <div class="footer">
                Энэхүү и-мэйл нь автоматаар илгээгдсэн тул хариу бичих шаардлагагүй.
            </div>
        </div>
    </body>
    </html>
    """
    
    await asyncio.to_thread(_send_smtp_sync, config, email, "Бүртгэлээ баталгаажуулна уу", html_content)


async def send_password_reset_email(email: str, username: str, token: str, db: AsyncSession):
    config = await get_smtp_config(db)
    
    # Reset Password Link
    link = f"http://oj.know.mn/auth/reset-password?token={token}"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                background-color: #0b0f19;
                color: #f3f4f6;
                margin: 0;
                padding: 40px 20px;
            }}
            .container {{
                max-width: 500px;
                margin: 0 auto;
                background: rgba(17, 24, 39, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 24px;
                padding: 40px;
                text-align: center;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            }}
            .logo {{
                font-size: 28px;
                font-weight: 900;
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                margin-bottom: 24px;
            }}
            h1 {{
                font-size: 20px;
                font-weight: 800;
                margin-bottom: 12px;
                color: #ffffff;
            }}
            p {{
                font-size: 14px;
                line-height: 1.6;
                color: #9ca3af;
                margin-bottom: 30px;
            }}
            .btn {{
                display: inline-block;
                padding: 12px 30px;
                font-weight: 700;
                font-size: 14px;
                color: #ffffff !important;
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
                text-decoration: none;
                border-radius: 12px;
                box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3);
                transition: transform 0.2s ease;
            }}
            .footer {{
                margin-top: 40px;
                font-size: 11px;
                color: #4b5563;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">OJ PLATFORM</div>
            <h1>Нууц үг сэргээх хүсэлт</h1>
            <p>Сайн байна уу, <b>{username}</b>!<br>Таны бүртгэлд нууц үг сэргээх хүсэлт бүртгэгдлээ. Доорх товчлуур дээр дарж нууц үгээ шинэчилнэ үү.</p>
            <a href="{link}" class="btn">Нууц үг сэргээх</a>
            <p style="margin-top: 30px; font-size: 11px; color: #6b7280;">Хэрэв товчлуур ажиллахгүй бол дараах холбоосыг хөтөч дээрээ хуулж орно уу:<br><span style="word-break: break-all; color: #f59e0b;">{link}</span></p>
            <div class="footer">
                Хэрэв та нууц үг сэргээх хүсэлт гаргаагүй бол энэ и-мэйлийг үл тоомсорлож болно.
            </div>
        </div>
    </body>
    </html>
    """
    
    await asyncio.to_thread(_send_smtp_sync, config, email, "Нууц үг сэргээх хүсэлт", html_content)
