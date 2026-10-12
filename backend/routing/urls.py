"""Routing URL declarations."""

from django.urls import path

from .views import RouteEvaluationGatewayView, RouteEvaluationPollingView

app_name = "routing"

urlpatterns = [
    path("route/", RouteEvaluationGatewayView.as_view(), name="route-gateway"),
    path(
        "route/<uuid:job_id>/",
        RouteEvaluationPollingView.as_view(),
        name="route-polling",
    ),
]
