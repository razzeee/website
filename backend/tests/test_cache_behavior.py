import os
import sys

import orjson
import pytest

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(ROOT_DIR)

from app import cache


class FakeRedis:
    def __init__(self):
        self.values = {"cache:endpoint:test:1": orjson.dumps({"value": 1})}
        self.set_calls = []

    async def scan(self, cursor=0, match=None, count=None):
        return 0, list(self.values)

    async def get(self, key):
        return self.values.get(key)

    async def set(self, key, value, **kwargs):
        self.set_calls.append((key, value, kwargs))
        self.values[key] = value


@pytest.mark.anyio
async def test_mark_stale_preserves_existing_ttl(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(cache.database, "get_redis", lambda: _redis(redis))

    assert await cache.mark_stale_by_pattern("cache:endpoint:test:*") == 1

    assert redis.set_calls[0][2] == {"keepttl": True}
    assert orjson.loads(redis.values["cache:endpoint:test:1"])["is_stale"] is True


async def _redis(redis):
    return redis
