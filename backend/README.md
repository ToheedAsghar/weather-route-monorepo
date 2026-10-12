# Weather-Aware Truck Routing Backend

Production-grade Django 5.x backend service that provides forecast-aware, risk-evaluated commercial truck routing.

## Stack
- **Framework**: Django 5.x + Django REST Framework
- **Task Queue**: Celery with Upstash Redis (TLS)
- **Database**: PostgreSQL
- **APIs**: Mapbox Directions API & Tomorrow.io Timeline API

## Testing & Quality
```bash
pytest
black --check .
isort --check-only .
flake8 .
```
