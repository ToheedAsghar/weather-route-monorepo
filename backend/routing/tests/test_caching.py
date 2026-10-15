"""Unit tests for geo-temporal caching and stampede lock mechanics."""

from routing.services.weather_cache import WeatherCacheManager


class TestWeatherCache:
    """Validate Redis caching operations and distributed lock synchronization."""

    def test_cache_key_generation(self):
        key = WeatherCacheManager.build_cache_key("dp3wh", "2026-10-15T08:00:00Z")
        assert key == "weather:dp3wh:2026-10-15T08:00:00Z"

    def test_cache_set_and_get(self, mock_cache_manager):
        geohash = "dp3wh"
        rounded_eta = "2026-10-15T08:00:00Z"
        weather_payload = {
            "temperature_f": 62.0,
            "wind_speed_mph": 18.5,
            "wind_gust_mph": 22.0,
            "rain_intensity_in_hr": 0.05,
            "snow_intensity_in_hr": 0.0,
            "weather_code": 1000,
        }

        # Initially absent
        assert mock_cache_manager.get_weather(geohash, rounded_eta) is None

        # Set in cache
        success = mock_cache_manager.set_weather(geohash, rounded_eta, weather_payload)
        assert success is True

        # Retrieve
        cached = mock_cache_manager.get_weather(geohash, rounded_eta)
        assert cached is not None
        assert cached["wind_speed_mph"] == 18.5

    def test_distributed_lock_acquisition_and_release(self, mock_cache_manager):
        geohash = "dp3wh"
        rounded_eta = "2026-10-15T08:00:00Z"
        token_worker_1 = "worker-uuid-1"
        token_worker_2 = "worker-uuid-2"

        # Worker 1 acquires lock
        acquired = mock_cache_manager.acquire_lock(geohash, rounded_eta, token_worker_1, timeout_ms=5000)
        assert acquired is True

        # Worker 2 attempts to acquire lock on the same cell -> should fail
        acquired_2 = mock_cache_manager.acquire_lock(geohash, rounded_eta, token_worker_2, timeout_ms=5000)
        assert acquired_2 is False

        # Worker 2 attempts release with wrong token -> fails
        released_wrong = mock_cache_manager.release_lock(geohash, rounded_eta, token_worker_2)
        assert released_wrong is False

        # Worker 1 releases with correct token -> succeeds
        released_correct = mock_cache_manager.release_lock(geohash, rounded_eta, token_worker_1)
        assert released_correct is True

        # Worker 2 can now acquire lock
        acquired_after_release = mock_cache_manager.acquire_lock(geohash, rounded_eta, token_worker_2, timeout_ms=5000)
        assert acquired_after_release is True
