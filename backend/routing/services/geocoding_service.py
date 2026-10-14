"""Geocoding service with Redis query caching, TTL, negative caching, and Mapbox Places integration."""

import json
import logging
from typing import Any, ClassVar, Dict, List, Optional
from urllib.parse import quote

import redis
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

MAPBOX_GEOCODING_URL = "https://api.mapbox.com/geocoding/v5/mapbox.places"


class GeocodingService:
    """Provides location autocomplete with backend Redis query caching, negative caching, and connection pooling."""

    _pool: ClassVar[Optional[redis.ConnectionPool]] = None

    def __init__(
        self,
        redis_client: Optional[redis.Redis] = None,
        access_token: Optional[str] = None,
        ttl_seconds: int = 604800,  # 7 days for valid results
        negative_ttl_seconds: int = 3600,  # 1 hour for empty/negative results
    ):
        if redis_client is not None:
            self.redis = redis_client
        else:
            self.redis = self._get_pooled_client()

        self.access_token = access_token or getattr(
            settings, "MAPBOX_ACCESS_TOKEN", ""
        )
        self.default_ttl = ttl_seconds
        self.negative_ttl = negative_ttl_seconds

    @classmethod
    def _get_pooled_client(cls) -> Optional[redis.Redis]:
        """Get or initialize a thread-safe shared Redis connection pool."""
        if cls._pool is None:
            redis_url = getattr(
                settings, "UPSTASH_REDIS_URL", "redis://localhost:6379/0"
            )
            try:
                cls._pool = redis.ConnectionPool.from_url(
                    redis_url, decode_responses=True, max_connections=20
                )
            except Exception as exc:
                logger.warning("Failed to initialize Redis connection pool for geocoding: %s", exc)
                return None
        try:
            return redis.Redis(connection_pool=cls._pool)
        except Exception as exc:
            logger.warning("Failed to acquire Redis client from pool: %s", exc)
            return None

    @staticmethod
    def build_cache_key(clean_query: str) -> str:
        """Construct Redis cache key for normalized query."""
        return f"geocode:query:{clean_query}"

    def search_places(self, query: str, limit: int = 6) -> List[Dict[str, Any]]:
        """Search places by query with Redis caching, negative caching, and Mapbox Places API."""
        clean = query.strip().lower()[:128]
        if len(clean) < 3:
            return []

        cache_key = self.build_cache_key(clean)

        # 1. Try reading from Redis global cache
        if self.redis is not None:
            try:
                cached_data = self.redis.get(cache_key)
                if cached_data is not None:
                    logger.debug("Geocoding cache hit for query: '%s'", clean)
                    return json.loads(cached_data)
            except Exception as exc:
                logger.warning("Error reading from Redis geocode cache: %s", exc)

        # 2. Cache miss: Query Mapbox Geocoding API
        suggestions = self._fetch_from_mapbox(clean, limit=limit)

        # 3. Store results in Redis with TTL (including negative cache for empty results)
        if self.redis is not None:
            ttl = self.default_ttl if suggestions else self.negative_ttl
            try:
                self.redis.setex(
                    cache_key,
                    ttl,
                    json.dumps(suggestions),
                )
                logger.debug(
                    "Cached %d geocoding suggestions for '%s' (TTL: %ds)",
                    len(suggestions),
                    clean,
                    ttl,
                )
            except Exception as exc:
                logger.warning("Error writing to Redis geocode cache: %s", exc)

        return suggestions

    def _fetch_from_mapbox(
        self, clean_query: str, limit: int = 6
    ) -> List[Dict[str, Any]]:
        """Call Mapbox Places Geocoding API."""
        if not self.access_token:
            logger.warning("Mapbox access token missing; returning empty suggestions")
            return []

        url = f"{MAPBOX_GEOCODING_URL}/{quote(clean_query)}.json"
        params = {
            "access_token": self.access_token,
            "autocomplete": "true",
            "limit": limit,
        }

        try:
            response = requests.get(url, params=params, timeout=5.0)
            response.raise_for_status()
            data = response.json()

            results = []
            for feature in data.get("features", []):
                center = feature.get("center", [])
                if len(center) >= 2:
                    results.append(
                        {
                            "id": feature.get("id"),
                            "place_name": feature.get("place_name", ""),
                            "text": feature.get("text", ""),
                            "lat": float(center[1]),
                            "lon": float(center[0]),
                        }
                    )
            return results
        except Exception as exc:
            logger.error("Mapbox Geocoding API request failed for '%s': %s", clean_query, exc)
            return []
