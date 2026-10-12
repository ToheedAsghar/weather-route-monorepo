"""Unit tests for polyline segmentation and ETA calculation."""

from datetime import datetime, timezone

from routing.services.polyline_service import PolylineService, round_to_nearest_hour


class TestPolylineService:
    """Test checkpoint spacing and timestamp interpolation."""

    def test_round_to_nearest_hour(self):
        dt1 = datetime(2026, 10, 15, 8, 14, 0, tzinfo=timezone.utc)
        assert round_to_nearest_hour(dt1) == "2026-10-15T08:00:00Z"

        dt2 = datetime(2026, 10, 15, 8, 30, 0, tzinfo=timezone.utc)
        assert round_to_nearest_hour(dt2) == "2026-10-15T09:00:00Z"

        dt3 = datetime(2026, 10, 15, 8, 45, 0, tzinfo=timezone.utc)
        assert round_to_nearest_hour(dt3) == "2026-10-15T09:00:00Z"

    def test_segment_route_25_miles(self):
        # Line from Chicago (approx 41.8781, -87.6298) to South Bend ~ 75 miles
        coords = [
            [-87.6298, 41.8781],
            [-86.9100, 41.7500],
            [-86.2520, 41.6764],
        ]
        dep_time = datetime(2026, 10, 15, 8, 0, 0, tzinfo=timezone.utc)
        total_dist_miles = 75.0
        total_dur_seconds = 75.0 / 50.0 * 3600  # 1.5 hours = 5400s

        checkpoints = PolylineService.segment_route(
            coordinates=coords,
            total_distance_miles=total_dist_miles,
            total_duration_seconds=total_dur_seconds,
            departure_time=dep_time,
            interval_miles=25,
        )

        assert len(checkpoints) >= 4  # 0, 25, 50, 75
        assert checkpoints[0]["distance_from_origin_miles"] == 0.0
        assert checkpoints[0]["sequence"] == 0
        assert "geohash" in checkpoints[0]
        assert len(checkpoints[0]["geohash"]) == 5

        # Check ETA progression
        eta0 = datetime.fromisoformat(checkpoints[0]["eta"])
        eta_last = datetime.fromisoformat(checkpoints[-1]["eta"])
        assert eta_last > eta0
