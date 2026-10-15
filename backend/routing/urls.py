"""Routing URL declarations."""

from django.urls import path

from .views import GeocodeAutocompleteView, HealthCheckView, RouteEvaluationGatewayView, RouteEvaluationPollingView

app_name = "routing"

urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("route/", RouteEvaluationGatewayView.as_view(), name="route-gateway"),
    path(
        "route/<uuid:job_id>/",
        RouteEvaluationPollingView.as_view(),
        name="route-polling",
    ),
    path(
        "geocode/autocomplete/",
        GeocodeAutocompleteView.as_view(),
        name="geocode-autocomplete",
    ),
]
