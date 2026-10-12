"""Pytest fixtures for routing tests."""

import fakeredis
import pytest

from routing.services.weather_cache import WeatherCacheManager


@pytest.fixture
def fake_redis_client():
    """Returns an in-memory fakeredis client for testing without external redis."""
    return fakeredis.FakeRedis(decode_responses=True)


@pytest.fixture
def mock_cache_manager(fake_redis_client):
    """Returns a WeatherCacheManager instance backed by fakeredis."""
    return WeatherCacheManager(client=fake_redis_client)


@pytest.fixture
def sample_route_request():
    return {
        "origin": {"lat": 41.8781, "lon": -87.6298, "address": "Chicago, IL"},
        "destination": {"lat": 40.7128, "lon": -74.0060, "address": "New York, NY"},
        "departure_time": "2026-10-15T08:00:00Z",
        "load_weight_lbs": 42000,
        "checkpoint_interval_miles": 25,
    }
