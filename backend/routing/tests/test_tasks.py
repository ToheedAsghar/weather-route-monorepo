"""Integration tests for the evaluate_route_weather Celery task."""

from datetime import datetime, timezone

import pytest

from routing.models import JobStatus, RouteEvaluationJob
from routing.tasks import evaluate_route_weather


@pytest.mark.django_db
class TestEvaluateRouteWeatherTask:
    """Validate Celery task orchestration and database updates."""

    def test_evaluate_route_weather_successful(self, mocker, mock_cache_manager):
        # Create a pending job
        job = RouteEvaluationJob.objects.create(
            origin={"lat": 41.8781, "lon": -87.6298, "address": "Chicago, IL"},
            destination={"lat": 40.7128, "lon": -74.0060, "address": "New York, NY"},
            departure_time=datetime(2026, 10, 15, 8, 0, 0, tzinfo=timezone.utc),
            load_weight_lbs=45000,
            checkpoint_interval_miles=25,
            status=JobStatus.PENDING,
        )

        # Mock WeatherCacheManager to use our in-memory fakeredis
        mocker.patch(
            "routing.tasks.WeatherCacheManager",
            return_value=mock_cache_manager,
        )

        # Mock TomorrowService: wind=40mph (triggers load rule 3: >40k lbs -> SEVERE)
        mock_tomorrow = mocker.patch("routing.tasks.TomorrowService")
        mock_tomorrow.return_value.fetch_weather.return_value = {
            "temperature_f": 52.0,
            "wind_speed_mph": 40.0,
            "wind_gust_mph": 48.0,
            "rain_intensity_in_hr": 0.0,
            "snow_intensity_in_hr": 0.0,
            "weather_code": 1000,
        }

        # Execute task synchronously
        evaluate_route_weather(str(job.id))

        # Reload job
        job.refresh_from_db()
        assert job.status == JobStatus.SUCCESS
        assert job.result_payload is not None
        assert "ranked_routes" in job.result_payload

        ranked_routes = job.result_payload["ranked_routes"]
        assert len(ranked_routes) > 0
        first_route = ranked_routes[0]
        assert first_route["rank"] == 1
        assert "risk_breakdown" in first_route
        assert len(first_route["checkpoints"]) > 0

        # Check that load escalation took effect
        first_cp = first_route["checkpoints"][0]
        assert first_cp["risk"]["overall_level"] == "SEVERE"
        assert "Escalated to SEVERE" in first_cp["risk"]["load_warning"]

    def test_evaluate_route_weather_job_not_found(self):
        import uuid

        # Should cleanly return without crashing
        evaluate_route_weather(str(uuid.uuid4()))

    def test_evaluate_route_weather_with_cached_checkpoints(self, mocker, mock_cache_manager):
        # Create a pending job
        job = RouteEvaluationJob.objects.create(
            origin={"lat": 41.8781, "lon": -87.6298, "address": "Chicago, IL"},
            destination={"lat": 40.7128, "lon": -74.0060, "address": "New York, NY"},
            departure_time=datetime(2026, 10, 15, 8, 0, 0, tzinfo=timezone.utc),
            load_weight_lbs=30000,
            checkpoint_interval_miles=25,
            status=JobStatus.PENDING,
        )

        mocker.patch(
            "routing.tasks.WeatherCacheManager",
            return_value=mock_cache_manager,
        )

        mock_tomorrow = mocker.patch("routing.tasks.TomorrowService")
        mock_tomorrow.return_value.fetch_weather.return_value = {
            "temperature_f": 60.0,
            "wind_speed_mph": 15.0,
            "wind_gust_mph": 20.0,
            "rain_intensity_in_hr": 0.0,
            "snow_intensity_in_hr": 0.0,
            "weather_code": 1000,
        }

        # First run populates the cache
        evaluate_route_weather(str(job.id))
        initial_fetch_count = mock_tomorrow.return_value.fetch_weather.call_count
        assert initial_fetch_count > 0

        # Second job with same route and time should hit the cache for all checkpoints
        job2 = RouteEvaluationJob.objects.create(
            origin={"lat": 41.8781, "lon": -87.6298, "address": "Chicago, IL"},
            destination={"lat": 40.7128, "lon": -74.0060, "address": "New York, NY"},
            departure_time=datetime(2026, 10, 15, 8, 0, 0, tzinfo=timezone.utc),
            load_weight_lbs=30000,
            checkpoint_interval_miles=25,
            status=JobStatus.PENDING,
        )
        evaluate_route_weather(str(job2.id))

        # Call count should not increase because of 100% cache hit
        assert mock_tomorrow.return_value.fetch_weather.call_count == initial_fetch_count
        job2.refresh_from_db()
        assert job2.status == JobStatus.SUCCESS

