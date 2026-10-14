"""API Gateway and polling endpoints for route evaluations."""

import logging

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import JobStatus, RouteEvaluationJob
from .serializers import (
    RouteEvaluationJobResponseSerializer,
    RouteEvaluationRequestSerializer,
)
from .services.geocoding_service import GeocodingService
from .tasks import evaluate_route_weather
from .throttles import GeocodeIpRateThrottle

logger = logging.getLogger(__name__)


class RouteEvaluationGatewayView(APIView):
    """API Gateway endpoint to initiate async route evaluation."""

    def post(self, request: Request) -> Response:
        """Accepts origin, destination, departure datetime, and load weight.

        Saves PENDING job, enqueues Celery task, and returns 202 Accepted.
        """
        serializer = RouteEvaluationRequestSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        job = RouteEvaluationJob.objects.create(
            origin=data["origin"],
            destination=data["destination"],
            departure_time=data["departure_time"],
            load_weight_lbs=data["load_weight_lbs"],
            checkpoint_interval_miles=data.get("checkpoint_interval_miles", 25),
            status=JobStatus.PENDING,
        )

        # Dispatch Celery background task
        try:
            evaluate_route_weather.delay(job_id=str(job.id))
        except Exception as exc:
            logger.warning(f"Celery dispatch failed, running eagerly or logging: {exc}")
            # If celery is running in eager mode or needs direct call in dev/tests:
            # evaluate_route_weather.apply_async((str(job.id),))

        response_serializer = RouteEvaluationJobResponseSerializer(
            job, context={"request": request}
        )
        return Response(response_serializer.data, status=status.HTTP_202_ACCEPTED)


class RouteEvaluationPollingView(APIView):
    """Polling endpoint to check job status and retrieve the evaluated payload."""

    def get(self, request: Request, job_id: str) -> Response:
        """Returns the job evaluation status and final payload once completed."""
        job = get_object_or_404(RouteEvaluationJob, id=job_id)
        serializer = RouteEvaluationJobResponseSerializer(
            job, context={"request": request}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)


class GeocodeAutocompleteView(APIView):
    """Autocomplete location search with backend Redis query caching and IP rate limiting."""

    throttle_classes = [GeocodeIpRateThrottle]

    def get(self, request: Request) -> Response:
        """Returns location autocomplete suggestions."""
        query = request.query_params.get("q", "").strip()
        if len(query) < 3:
            return Response([], status=status.HTTP_200_OK)

        service = GeocodingService()
        suggestions = service.search_places(query)
        return Response(suggestions, status=status.HTTP_200_OK)

