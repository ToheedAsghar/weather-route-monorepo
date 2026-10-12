"""DRF serializers for input validation and output formatting."""

from rest_framework import serializers

from .models import RouteEvaluationJob


class CoordinateSerializer(serializers.Serializer):
    lat = serializers.FloatField(
        min_value=-90.0,
        max_value=90.0,
        help_text="Latitude in decimal degrees",
    )
    lon = serializers.FloatField(
        min_value=-180.0,
        max_value=180.0,
        help_text="Longitude in decimal degrees",
    )
    address = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
        help_text="Optional human-readable address or city/state name",
    )


class RouteEvaluationRequestSerializer(serializers.Serializer):
    origin = CoordinateSerializer(help_text="Trip origin coordinate")
    destination = CoordinateSerializer(help_text="Trip destination coordinate")
    departure_time = serializers.DateTimeField(
        help_text="Truck scheduled departure datetime (ISO 8601)"
    )
    load_weight_lbs = serializers.IntegerField(
        min_value=1,
        max_value=150000,
        help_text="Gross vehicle load weight in pounds",
    )
    checkpoint_interval_miles = serializers.ChoiceField(
        choices=[10, 25, 50],
        default=25,
        required=False,
        help_text="Spacing between weather sample checkpoints (10, 25, or 50 miles)",
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
