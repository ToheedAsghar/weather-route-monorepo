"""Rate limiting throttles for routing API endpoints."""

from rest_framework.throttling import AnonRateThrottle


class GeocodeIpRateThrottle(AnonRateThrottle):
    """Rate limit geocoding autocomplete requests per IP address."""

    scope = "geocode"
