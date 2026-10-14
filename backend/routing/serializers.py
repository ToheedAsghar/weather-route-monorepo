"""DRF serializers for input validation and output formatting."""

from rest_framework import serializers

from .constants import (
    ALLOWED_CHECKPOINT_INTERVAL_MILES, DEFAULT_CHECKPOINT_INTERVAL_MILES, HELP_TEXT_CHECKPOINT_INTERVAL,
    HELP_TEXT_DEPARTURE_TIME, HELP_TEXT_DESTINATION, HELP_TEXT_LOAD_WEIGHT_LBS, HELP_TEXT_ORIGIN, MAX_ADDRESS_LENGTH,
    MAX_LATITUDE, MAX_LOAD_WEIGHT_LBS, MAX_LONGITUDE, MIN_LATITUDE, MIN_LOAD_WEIGHT_LBS, MIN_LONGITUDE,
)
from .models import RouteEvaluationJob

# Serializer-specific field descriptions
HELP_TEXT_LATITUDE: str = "Latitude in decimal degrees"
HELP_TEXT_LONGITUDE: str = "Longitude in decimal degrees"
HELP_TEXT_ADDRESS: str = "Optional human-readable address or city/state name"


class CoordinateSerializer(serializers.Serializer):
    lat = serializers.FloatField(
        min_value=MIN_LATITUDE,
        max_value=MAX_LATITUDE,
        help_text=HELP_TEXT_LATITUDE,
    )
    lon = serializers.FloatField(
        min_value=MIN_LONGITUDE,
        max_value=MAX_LONGITUDE,
        help_text=HELP_TEXT_LONGITUDE,
    )
    address = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_ADDRESS_LENGTH,
        help_text=HELP_TEXT_ADDRESS,
    )


class RouteEvaluationRequestSerializer(serializers.Serializer):
    origin = CoordinateSerializer(help_text=HELP_TEXT_ORIGIN)
    destination = CoordinateSerializer(help_text=HELP_TEXT_DESTINATION)
    departure_time = serializers.DateTimeField(
        help_text=HELP_TEXT_DEPARTURE_TIME,
    )
    load_weight_lbs = serializers.IntegerField(
        min_value=MIN_LOAD_WEIGHT_LBS,
        max_value=MAX_LOAD_WEIGHT_LBS,
        help_text=HELP_TEXT_LOAD_WEIGHT_LBS,
    )
    checkpoint_interval_miles = serializers.ChoiceField(
        choices=ALLOWED_CHECKPOINT_INTERVAL_MILES,
        default=DEFAULT_CHECKPOINT_INTERVAL_MILES,
        required=False,
        help_text=HELP_TEXT_CHECKPOINT_INTERVAL,
    )


class RouteEvaluationJobResponseSerializer(serializers.ModelSerializer):
    job_id = serializers.UUIDField(source="id", read_only=True)
    poll_url = serializers.SerializerMethodField()
    result = serializers.JSONField(source="result_payload", read_only=True)

    class Meta:
        model = RouteEvaluationJob
        fields = [
            "job_id",
            "status",
            "poll_url",
            "created_at",
            "completed_at",
            "error_message",
            "result",
        ]

    def get_poll_url(self, obj) -> str:
        request = self.context.get("request")
        if request:
            return request.build_absolute_uri(f"/api/route/{obj.id}/")
        return f"/api/route/{obj.id}/"
