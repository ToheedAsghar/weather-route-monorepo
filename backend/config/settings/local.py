"""Local development settings."""

from .base import *  # noqa: F401, F403

DEBUG = True

# Allow all hosts in local dev
ALLOWED_HOSTS = ["*"]

# Optional: Celery task always eager in test or if Celery worker is offline
CELERY_TASK_ALWAYS_EAGER = False
CELERY_TASK_EAGER_PROPAGATES = True
