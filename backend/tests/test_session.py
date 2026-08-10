from fastapi import Response

from app.core.session import ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE, clear_session_cookies, set_session_cookies


def test_session_cookies_keep_tokens_http_only_and_csrf_readable():
    response = Response()
    set_session_cookies(response, "access", "refresh")
    headers = "\n".join(value.decode() for key, value in response.raw_headers if key == b"set-cookie")

    assert ACCESS_COOKIE in headers and REFRESH_COOKIE in headers and CSRF_COOKIE in headers
    access_header = next(value.decode() for key, value in response.raw_headers if key == b"set-cookie" and ACCESS_COOKIE.encode() in value)
    csrf_header = next(value.decode() for key, value in response.raw_headers if key == b"set-cookie" and CSRF_COOKIE.encode() in value)
    assert "HttpOnly" in access_header
    assert "HttpOnly" not in csrf_header
    assert "SameSite=lax" in headers


def test_logout_clears_all_session_cookies():
    response = Response()
    clear_session_cookies(response)
    headers = "\n".join(value.decode() for key, value in response.raw_headers if key == b"set-cookie")
    assert ACCESS_COOKIE in headers and REFRESH_COOKIE in headers and CSRF_COOKIE in headers
    assert "Max-Age=0" in headers
