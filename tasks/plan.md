# Implementation Plan: Weather-Aware Truck Routing (Monorepo)

## Architecture
- Strict monorepo architecture:
  - `backend/`: Django 5.x, DRF, Celery, Upstash Redis caching, PostgreSQL persistence, pyproject.toml, PEP 8 tooling.
  - `frontend/`: Space reserved for React application (Vite, Mapbox GL JS, route comparison, live polling).
  - Root: Multi-container orchestration via `docker-compose.yml`, shared repository documentation.

## Phase Status
- [x] Phase 1: Establish monorepo structure (`backend/` and `frontend/`).
- [x] Phase 2: Implement Django models, DRF serializers, 202 Accepted Gateway, and polling endpoints.
- [x] Phase 3: Implement domain services (Mapbox 3 alternatives, polyline segmentation & ETAs, Upstash Redis geo-temporal cache with mutex lock, Tomorrow.io weather client, exact risk engine, route ranking).
- [x] Phase 4: Celery background orchestration task (`evaluate_route_weather`).
- [x] Phase 5: Verification with pytest and PEP 8 formatters (black, isort, flake8).
