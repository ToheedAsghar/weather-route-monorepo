"""Data models for weather-aware truck routing."""

import uuid

from django.db import models
from django.utils import timezone


class JobStatus(models.TextChoices):
    PENDING = "PENDING", "Pending"
    PROCESSING = "PROCESSING", "Processing"
    SUCCESS = "SUCCESS", "Success"
    FAILED = "FAILED", "Failed"


class RouteEvaluationJob(models.Model):
    """Represents an asynchronous route weather risk evaluation job."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    status = models.CharField(
        max_length=20,
        choices=JobStatus.choices,
        default=JobStatus.PENDING,
        db_index=True,
    )

    # Input parameters
    origin = models.JSONField(help_text="{'lat': float, 'lon': float, 'address': str}")
    destination = models.JSONField(
        help_text="{'lat': float, 'lon': float, 'address': str}"
    )
    departure_time = models.DateTimeField(help_text="Departure time in ISO 8601 format")
    load_weight_lbs = models.PositiveIntegerField(
        help_text="Gross truck load weight in pounds"
    )
    checkpoint_interval_miles = models.PositiveIntegerField(
        default=25,
        help_text="Interval in miles between weather checkpoints (10, 25, or 50)",
    )

    # Result data
    result_payload = models.JSONField(
        null=True,
        blank=True,
        help_text="Complete evaluated payload with ranked routes",
    )
    error_message = models.TextField(
        null=True,
        blank=True,
        help_text="Diagnostic error details if the job failed",
    )

    # Timestamps
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Route Evaluation Job"
        verbose_name_plural = "Route Evaluation Jobs"
        indexes = [
            models.Index(fields=["status", "created_at"]),
        ]

    def mark_processing(self):
        """Update job status to PROCESSING."""
        self.status = JobStatus.PROCESSING
        self.save(update_fields=["status", "updated_at"])

    def mark_success(self, payload: dict):
        """Update job status to SUCCESS with evaluated payload."""
        self.status = JobStatus.SUCCESS
        self.result_payload = payload
        self.completed_at = timezone.now()
        self.save(
            update_fields=["status", "result_payload", "completed_at", "updated_at"]
        )

    def mark_failed(self, error: str):
        """Update job status to FAILED with error message."""
        self.status = JobStatus.FAILED
        self.error_message = error
        self.completed_at = timezone.now()
        self.save(
            update_fields=["status", "error_message", "completed_at", "updated_at"]
        )

    def __str__(self):
        return f"RouteEvaluationJob {self.id} [{self.status}]"
