"""Local development settings."""

from .base import *  # noqa: F401, F403

DEBUG = True

# Allow all hosts in local dev
ALLOWED_HOSTS = ["*"]

# Run Celery tasks synchronously in local dev when no separate worker is running
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
