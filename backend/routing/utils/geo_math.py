"""Geographic mathematics and distance calculation utilities."""

import math
from typing import Tuple

EARTH_RADIUS_MILES = 3958.8


def haversine_distance_miles(
    lat1: float, lon1: float, lat2: float, lon2: float
) -> float:
    """Calculate the great-circle distance between two points in miles."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    return EARTH_RADIUS_MILES * c


def interpolate_coordinates(
    lat1: float, lon1: float, lat2: float, lon2: float, fraction: float
) -> Tuple[float, float]:
    """Linearly interpolate between two coordinates given fraction in [0, 1]."""
    clamped_frac = max(0.0, min(1.0, fraction))
    interp_lat = lat1 + (lat2 - lat1) * clamped_frac
    interp_lon = lon1 + (lon2 - lon1) * clamped_frac
    return round(interp_lat, 6), round(interp_lon, 6)
