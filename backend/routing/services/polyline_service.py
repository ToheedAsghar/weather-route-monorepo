"""Polyline segmentation and ETA calculation service."""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from routing.utils.geo_math import haversine_distance_miles, interpolate_coordinates
from routing.utils.geohash_utils import encode_geohash


def round_to_nearest_hour(dt: datetime) -> str:
    """Round datetime to the nearest hour and format as ISO 8601 UTC string."""
    # Ensure dt is UTC aware
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)

    minute = dt.minute
    second = dt.second
    base_dt = dt.replace(minute=0, second=0, microsecond=0)
    if minute >= 30 or (minute == 29 and second >= 30):
        base_dt += timedelta(hours=1)
    return base_dt.strftime("%Y-%m-%dT%H:00:00Z")


class PolylineService:
    """Segments route polylines and computes checkpoint ETAs and geohashes."""

    @classmethod
    def segment_route(
        cls,
        coordinates: List[List[float]],
        total_distance_miles: float,
        total_duration_seconds: float,
        departure_time: datetime,
        interval_miles: int = 25,
    ) -> List[Dict[str, Any]]:
        """Sample route coordinates every interval_miles and compute ETA and geohash."""
        if not coordinates:
            return []

        # If interval is not one of 10, 25, 50, clamp/fallback to 25
        if interval_miles not in (10, 25, 50):
            interval_miles = 25

        # Coordinates from GeoJSON are [longitude, latitude]
        points = [(c[1], c[0]) for c in coordinates]

        if len(points) == 1:
            lat, lon = points[0]
            eta_iso = departure_time.isoformat()
            return [
                {
                    "sequence": 0,
                    "coordinates": {"lat": lat, "lon": lon},
                    "distance_from_origin_miles": 0.0,
                    "eta": eta_iso,
                    "rounded_eta": round_to_nearest_hour(departure_time),
                    "geohash": encode_geohash(lat, lon, precision=5),
                }
            ]

        # Calculate cumulative distances along all line segments
        cum_distances = [0.0]
        for i in range(len(points) - 1):
            seg_dist = haversine_distance_miles(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1])
            cum_distances.append(cum_distances[-1] + seg_dist)

        total_poly_dist = cum_distances[-1]
        # Use polyline distance if valid, else total_distance_miles
        effective_total_miles = total_poly_dist if total_poly_dist > 0.01 else total_distance_miles
        if effective_total_miles <= 0:
            effective_total_miles = 1.0

        checkpoints = []
        target_dist = 0.0
        seq = 0

        while target_dist <= effective_total_miles:
            # Find the segment containing target_dist
            idx = 0
            while idx < len(cum_distances) - 1 and cum_distances[idx + 1] < target_dist:
                idx += 1

            if idx >= len(cum_distances) - 1:
                lat, lon = points[-1]
            else:
                d_start = cum_distances[idx]
                d_end = cum_distances[idx + 1]
                seg_length = d_end - d_start
                fraction = (target_dist - d_start) / seg_length if seg_length > 0 else 0.0
                lat, lon = interpolate_coordinates(
                    points[idx][0],
                    points[idx][1],
                    points[idx + 1][0],
                    points[idx + 1][1],
                    fraction,
                )

            # Elapsed time along route proportional to distance
            fraction_of_route = target_dist / effective_total_miles
            elapsed_sec = fraction_of_route * total_duration_seconds
            eta = departure_time + timedelta(seconds=elapsed_sec)

            checkpoints.append(
                {
                    "sequence": seq,
                    "coordinates": {"lat": round(lat, 6), "lon": round(lon, 6)},
                    "distance_from_origin_miles": round(target_dist, 2),
                    "eta": eta.isoformat(),
                    "rounded_eta": round_to_nearest_hour(eta),
                    "geohash": encode_geohash(lat, lon, precision=5),
                }
            )

            seq += 1
            target_dist += interval_miles

        # Ensure the destination endpoint is included if not close to
        # the last checkpoint
        if not checkpoints or checkpoints[-1]["distance_from_origin_miles"] < effective_total_miles - 2.0:
            dest_lat, dest_lon = points[-1]
            dest_eta = departure_time + timedelta(seconds=total_duration_seconds)
            checkpoints.append(
                {
                    "sequence": seq,
                    "coordinates": {
                        "lat": round(dest_lat, 6),
                        "lon": round(dest_lon, 6),
                    },
                    "distance_from_origin_miles": round(effective_total_miles, 2),
                    "eta": dest_eta.isoformat(),
                    "rounded_eta": round_to_nearest_hour(dest_eta),
                    "geohash": encode_geohash(dest_lat, dest_lon, precision=5),
                }
            )

        return checkpoints
