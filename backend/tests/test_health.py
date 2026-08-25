import json

import pytest

from app import main


class _DatabaseContext:
    def __init__(self, *, fails: bool = False):
        self.fails = fails

    async def __aenter__(self):
        if self.fails:
            raise RuntimeError("database unavailable")
        return self

    async def __aexit__(self, *_args):
        return False

    async def execute(self, _statement):
        return None


class _RedisClient:
    def __init__(self, *, fails: bool = False):
        self.fails = fails

    async def ping(self):
        if self.fails:
            raise RuntimeError("redis unavailable")
        return True

    async def aclose(self):
        return None


@pytest.mark.asyncio
async def test_liveness_does_not_require_dependencies():
    response = await main.health_check()

    assert response["status"] == "healthy"
    assert response["service"] == "oj-backend"


@pytest.mark.asyncio
async def test_readiness_is_healthy_only_when_all_dependencies_are_healthy(monkeypatch):
    monkeypatch.setattr(main, "AsyncSessionLocal", lambda: _DatabaseContext())
    monkeypatch.setattr("redis.asyncio.Redis.from_url", lambda _url: _RedisClient())
    monkeypatch.setattr(main.storage_client.client, "bucket_exists", lambda _bucket: True)

    response = await main.readiness_check()
    payload = json.loads(response.body)

    assert response.status_code == 200
    assert payload == {
        "status": "ready",
        "checks": {"postgres": True, "redis": True, "minio": True},
    }


@pytest.mark.asyncio
async def test_readiness_fails_closed_without_required_dependencies(monkeypatch):
    monkeypatch.setattr(main, "AsyncSessionLocal", lambda: _DatabaseContext(fails=True))
    monkeypatch.setattr(
        "redis.asyncio.Redis.from_url",
        lambda _url: _RedisClient(fails=True),
    )
    monkeypatch.setattr(main.storage_client.client, "bucket_exists", lambda _bucket: False)

    response = await main.readiness_check()
    payload = json.loads(response.body)

    assert response.status_code == 503
    assert payload == {
        "status": "not_ready",
        "checks": {"postgres": False, "redis": False, "minio": False},
    }
