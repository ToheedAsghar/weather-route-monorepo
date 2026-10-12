"""Admin site configuration for routing models."""

from django.contrib import admin

from .models import RouteEvaluationJob


@admin.register(RouteEvaluationJob)
class RouteEvaluationJobAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "status",
        "load_weight_lbs",
        "checkpoint_interval_miles",
        "created_at",
        "completed_at",
    )
    list_filter = ("status", "created_at")
    readonly_fields = ("id", "created_at", "updated_at", "completed_at")
    search_fields = ("id",)
