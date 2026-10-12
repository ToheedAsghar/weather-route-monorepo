"""Geo-temporal Redis cache manager with distributed locking to prevent stampedes."""

import json
import logging
from typing import Any, Dict, Optional

import redis
from django.conf import settings

logger = logging.getLogger(__name__)

LUA_RELEASE_LOCK = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
else
    return 0
end
"""


class WeatherCacheManager:
    """Manages Redis geo-temporal caching and single-flight distributed locks."""

    def __init__(self, client: Optional[redis.Redis] = None):
        if client is not None:
            self.client = client
        else:
            redis_url = getattr(
                settings, "UPSTASH_REDIS_URL", "redis://localhost:6379/0"
            )
            self.client = redis.from_url(redis_url, decode_responses=True)
        self.default_ttl = 10800  # 3 hours in seconds

    @staticmethod
    def build_cache_key(geohash: str, rounded_eta_iso: str) -> str:
        """Construct geo-temporal cache key: weather:{geohash}:{rounded_eta}."""
        return f"weather:{geohash}:{rounded_eta_iso}"

    @staticmethod
    def build_lock_key(geohash: str, rounded_eta_iso: str) -> str:
        """Construct lock key for coordinate/time bucket."""
        return f"lock:weather:{geohash}:{rounded_eta_iso}"

    def get_weather(
        self, geohash: str, rounded_eta_iso: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve cached weather forecast payload."""
        key = self.build_cache_key(geohash, rounded_eta_iso)
        try:
            val = self.client.get(key)
            if val:
                return json.loads(val)
        except Exception as exc:
            logger.warning(f"Cache get error for {key}: {exc}")
        return None

    def set_weather(
        self,
        geohash: str,
        rounded_eta_iso: str,
        weather_data: Dict[str, Any],
        ttl: Optional[int] = None,
    ) -> bool:
        """Store weather payload in Redis with TTL."""
        key = self.build_cache_key(geohash, rounded_eta_iso)
        expire = ttl or self.default_ttl
        try:
            return bool(self.client.set(key, json.dumps(weather_data), ex=expire))
        except Exception as exc:
            logger.warning(f"Cache set error for {key}: {exc}")
            return False

    def acquire_lock(
        self, geohash: str, rounded_eta_iso: str, token: str, timeout_ms: int = 10000
    ) -> bool:
        """Acquire distributed lock using SET NX PX to serialize API calls."""
        lock_key = self.build_lock_key(geohash, rounded_eta_iso)
        try:
            acquired = self.client.set(lock_key, token, nx=True, px=timeout_ms)
            return bool(acquired)
        except Exception as exc:
            logger.warning(f"Lock acquire error for {lock_key}: {exc}")
            return False

    def release_lock(self, geohash: str, rounded_eta_iso: str, token: str) -> bool:
        """Atomically release distributed lock using Lua script with fallback."""
        lock_key = self.build_lock_key(geohash, rounded_eta_iso)
        try:
            res = self.client.eval(LUA_RELEASE_LOCK, 1, lock_key, token)
            return bool(res)
        except Exception:
            # Fallback for environments where eval is unsupported (e.g. fakeredis)
            try:
                val = self.client.get(lock_key)
                if val == token:
                    self.client.delete(lock_key)
                    return True
                return False
            except Exception as exc:
                logger.warning("Lock release fallback error for %s: %s", lock_key, exc)
                return False
