"""Celery application configuration."""

import os
import ssl

from celery import Celery

# Set default Django settings module for celery
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

app = Celery("weather_routing")

# Load configuration from Django settings, using the CELERY_ namespace
app.config_from_object("django.conf:settings", namespace="CELERY")

# Upstash Redis TLS configuration
redis_url = os.environ.get("UPSTASH_REDIS_URL", "redis://localhost:6379/0")
if redis_url.startswith("rediss://"):
    ssl_context = {"ssl_cert_reqs": ssl.CERT_REQUIRED}
    app.conf.broker_use_ssl = ssl_context
    app.conf.redis_backend_use_ssl = ssl_context

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes hard limit
    task_soft_time_limit=240,  # 4 minutes soft limit
    broker_pool_limit=10,  # Connection pool limit for Upstash serverless Redis
    result_expires=86400,  # 24 hours result expiration
)

# Auto-discover tasks in installed apps
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Debug task to test Celery execution."""
    print(f"Celery Debug Request: {self.request!r}")
