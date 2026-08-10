"""Cookie session and CSRF helpers shared by authentication endpoints."""
import secrets
from fastapi import Response

from app.core.config import settings

ACCESS_COOKIE = "oj_access"
REFRESH_COOKIE = "oj_refresh"
CSRF_COOKIE = "oj_csrf"


def _cookie_options(http_only: bool = True) -> dict:
    return {
        "httponly": http_only,
        "secure": settings.COOKIE_SECURE,
        "samesite": "lax",
        "domain": settings.COOKIE_DOMAIN,
        "path": "/",
    }


def set_session_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(ACCESS_COOKIE, access_token, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, **_cookie_options())
    response.set_cookie(REFRESH_COOKIE, refresh_token, max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, **_cookie_options())
    response.set_cookie(CSRF_COOKIE, secrets.token_urlsafe(32), max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400, **_cookie_options(http_only=False))


def clear_session_cookies(response: Response) -> None:
    for name, http_only in ((ACCESS_COOKIE, True), (REFRESH_COOKIE, True), (CSRF_COOKIE, False)):
        response.delete_cookie(name, domain=settings.COOKIE_DOMAIN, path="/", httponly=http_only, secure=settings.COOKIE_SECURE, samesite="lax")
