# Weather-Aware Truck Routing (Monorepo)

A production-grade monorepo containing a weather-aware commercial truck routing system.

## Repository Structure
- [`backend/`](./backend): Django 5.x REST backend, Celery asynchronous workers, Tomorrow.io weather integration, Mapbox polyline segmentation, geo-temporal Redis caching, and risk ranking engine.
- [`frontend/`](./frontend): Space reserved for the React client application (interactive routing map, route alternatives comparison, risk advisories).
- `docker-compose.yml`: Multi-container development environment (PostgreSQL 16, Redis 7).

## Quick Start

### 1. Start Infrastructure Services
```bash
docker-compose up -d
```

### 2. Setup & Run Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

### 3. Run Celery Worker
```bash
cd backend
source .venv/bin/activate
celery -A config worker --loglevel=INFO --concurrency=4
```

### 4. Run Backend Tests & Verification
```bash
cd backend
pytest -v
black --check .
isort --check-only .
flake8 .
```
