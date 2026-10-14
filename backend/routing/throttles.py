"""Rate limiting throttles for routing API endpoints."""

from rest_framework.throttling import AnonRateThrottle


class GeocodeIpRateThrottle(AnonRateThrottle):
    """Rate limit geocoding autocomplete requests per IP address."""

    scope = "geocode"


class RouteEvaluationGatewayThrottle(AnonRateThrottle):
    """Rate limit route evaluation job creation per IP address."""

    scope = "route_create"
