# WeatherRoute

[![Tests](https://img.shields.io/badge/tests-54%20passing-brightgreen.svg)](backend/routing/tests/)
[![Python](https://img.shields.io/badge/python-3.12%2B-3776AB.svg?logo=python&logoColor=white)](https://www.python.org/)
[![Django](https://img.shields.io/badge/django-5.2-092E20.svg?logo=django&logoColor=white)](https://www.djangoproject.com/)
[![React](https://img.shields.io/badge/react-19.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-5.7-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Celery](https://img.shields.io/badge/celery-5.4-37814A.svg?logo=celery&logoColor=white)](https://docs.celeryq.dev/)
[![Redis](https://img.shields.io/badge/redis-7.0-DC382D.svg?logo=redis&logoColor=white)](https://redis.io/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

### Quick Links
- **Live Web Application (Vercel)**: [https://weather-route-eight.vercel.app](https://weather-route-eight.vercel.app)
- **API Health Check (Render)**: [https://weather-route-monorepo.onrender.com/api/health/](https://weather-route-monorepo.onrender.com/api/health/)
- **Architecture Diagram**: [docs/assets/architecture-diagram.png](docs/assets/architecture-diagram.png)

---

### Project Overview

This repository contains the complete implementation built for the **Full Stack Developer** technical assessment by **Spotter (Spotter AI)** (received on October 11, 2026).

The Assessment was to build a production-grade **React + Django** web application that helps commercial truck drivers choose the safest route based on weather conditions, vehicle gross load weight, and travel duration. The platform generates 3 driving route options, samples weather conditions at 10 / 25 / 50-mile intervals based on projected ETAs, evaluates physics-informed weather risk thresholds, deterministically ranks routes, and visualizes corridor hazards on an interactive map with an integrated 0–48 hour forecast slider.

---

## 1. Visual Showcase & User Experience

![WeatherRoute Dispatch UI Preview](docs/assets/ui-preview.png)

### Key Platform Capabilities
- **0–48 Hour Dynamic Weather Intensity Slider**: Scrub departure times forward up to 48 hours to evaluate how storm fronts evolve and find the optimal dispatch departure window.
- **Risk-Coded Polyline Corridors**: Routes are divided into color-coded segments:
  - 🟢 **Low / Safe**: Optimal highway driving conditions.
  - 🟡 **Moderate**: Elevated precipitation or crosswinds; driver caution advised.
  - 🔴 **Severe**: High risk of hydroplaning, heavy snow accumulation, or crosswind instability.
  - ⚫ **No Travel**: Prohibitive meteorological conditions (gusts $\ge 55\text{ mph}$, freezing rain, blizzard conditions).
- **Deterministic Route Ranking**: Clear comparative cards that weigh safety exposure (miles in severe weather) against travel duration.
- **Micro-Weather Checkpoint Inspector**: Drill into any sampled 10, 25, or 50-mile waypoint along the route to inspect arrival timestamp, sustained winds, gusts, rain rate, snowfall, and payload-specific risk advisories.

---

## 2. System Architecture & Engineering Deep Dive

WeatherRoute implements an asynchronous, distributed computing architecture designed to process multi-leg route alternatives under strict external API rate limits.

![WeatherRoute System Architecture](docs/assets/architecture-diagram.png)

### Engineering Details: The "Why" Behind Architectural Choices

#### 1. Autocomplete Flow & Upstream API Credit Protection
- **Debounced Input (300ms, $\ge 3$ characters)**: Prevents burst traffic on every keystroke.
- **Fail-Fast Boundary**: The frontend queries `/api/geocode/autocomplete/` rather than calling Mapbox directly from the browser. This centralizes rate limiting (60 requests/min per IP) and protects secret tokens. If the backend is unreachable, the client aborts immediately rather than wasting user quotas.
- **Two-Tier Redis Caching**:
  - **Positive hits**: Stored under `geocode:query:{query}` with a **7-day TTL (604,800s)**.
  - **Negative caching**: Queries that yield zero results are cached with a **1-hour TTL (3,600s)** to prevent repeated cache-miss hammering.

#### 2. Asynchronous Route Engine & HTTP 202 Accepted
Computing weather along 3 route alternatives across a 1,000-mile journey requires analyzing dozens of checkpoints. Performing this synchronously would exceed HTTP gateway timeouts (e.g., Cloudflare 30s limits or Render HTTP limits).
- `POST /api/route/` validates coordinates, departure time, and vehicle weight.
- Instantiates a `RouteEvaluationJob` model in state `PENDING`.
- Immediately issues `HTTP 202 Accepted` returning `{ "job_id": "<uuid>", "status": "PENDING", "poll_url": "/api/route/<uuid>/" }`.
- Hands off processing to Celery workers via Redis message brokers.

#### 3. Corridor Checkpoint Sampling & Spatial Deduplication
- **Polyline Interpolation**: Routes are sampled every 10, 25, or 50 miles (default: 25 miles).
- **Time-Space Geohashing**: Checkpoint coordinates are converted to Geohashes with calculated arrival timestamps rounded to the nearest hour: `(geohash, rounded_eta)`.
- **Deduplication Across Alternatives**: Alternative routes frequently share highway corridors (e.g., I-80 or I-90). Checkpoints that share the same spatio-temporal key are deduplicated into a single query set, reducing external weather requests by **30–60%**.

#### 4. Distributed Cache Locking (Thundering Herd Defense)
- When multiple workers evaluate routes passing through intersecting corridors during the same hour, they attempt to read `weather:{geohash}:{rounded_eta_hour}` (1-hour TTL).
- On cache miss, the worker acquires a Redis mutex lock:
  ```text
  SET lock:weather:{geohash}:{rounded_eta_hour} {uuid} NX PX 8000
  ```
- The lock holder requests data from Tomorrow.io and populates the cache. Waiting threads poll the cache after 200ms, preventing duplicate external requests.
- Weather fetches are parallelized via `concurrent.futures.ThreadPoolExecutor(max_workers=8)`.

#### 5. Physics-Informed Vehicle Risk & Deterministic Ranking
Risk evaluation considers truck mechanics rather than standard automobile profiles:
- **Aerodynamic Crosswind Tipping**: Empty or light trailers ($< 25,000\text{ lbs}$) have a high center of lateral pressure. Sustained crosswinds or gusts $\ge 45\text{ mph}$ trigger `SEVERE` rollover alerts, and $\ge 55\text{ mph}$ enforce a mandatory `NO_TRAVEL` recommendation.
- **Heavy Load Braking Distance Degradation**: Heavy freight ($> 60,000\text{ lbs}$) experiences extended stopping distances on wet or snowy asphalt. Rain rates $> 0.5\text{ in/hr}$ or snow $> 1.0\text{ in/hr}$ trigger severe hydroplaning and jackknife warnings.
- **Deterministic Ranking Hierarchy**:
  1. Fewest `no_travel_miles` (0 miles prioritized)
  2. Fewest `severe_miles`
  3. Fewest `high_miles`
  4. Lowest `average_risk_score` (0–100 composite index)
  5. Shortest `total_duration_hours` (tiebreaker)

#### 6. Client Polling Lifecycle
- Frontend polls `GET /api/route/{job_id}/` every **2,000ms**.
- Job states: `PENDING` $\rightarrow$ `PROCESSING` $\rightarrow$ `SUCCESS` or `FAILED`.
- Once `SUCCESS` is returned, the polling loop terminates and renders route options, risk breakdowns, and checkpoint inspection markers on the Mapbox GL map.

---

## 3. Verified API Specification

All endpoints are hosted under `/api/` and return `application/json`.

### 1. Location Autocomplete
Search places with Redis caching and upstream rate-limiting.

- **Method**: `GET`
- **Path**: `/api/geocode/autocomplete/`
- **Throttle**: `60 requests / minute`
- **Query Parameters**:
  - `q` (string, required): Search query (minimum 3 characters).

#### Request Example
```bash
curl -X GET "https://weather-route-monorepo.onrender.com/api/geocode/autocomplete/?q=chicago"
```

#### Response (`HTTP 200 OK`)
```json
[
  {
    "id": "place.41235489",
    "place_name": "Chicago, Illinois, United States",
    "text": "Chicago",
    "lat": 41.8781,
    "lon": -87.6298
  }
]
```

---

### 2. Submit Route Evaluation Job
Enqueues an asynchronous corridor evaluation job.

- **Method**: `POST`
- **Path**: `/api/route/`
- **Throttle**: `30 requests / minute`
- **Payload Constraints**:
  - `origin.lat` / `destination.lat`: Float between `-90.0` and `90.0`.
  - `origin.lon` / `destination.lon`: Float between `-180.0` and `180.0`.
  - `departure_time`: ISO 8601 formatted datetime string.
  - `load_weight_lbs`: Integer between `1` and `150,000` lbs.
  - `checkpoint_interval_miles`: Optional integer choice (`10`, `25`, `50`). Default: `25`.

#### Request Example
```bash
curl -X POST "https://weather-route-monorepo.onrender.com/api/route/" \
  -H "Content-Type: application/json" \
  -d '{
    "origin": {
      "lat": 41.8781,
      "lon": -87.6298,
      "address": "Chicago, IL"
    },
    "destination": {
      "lat": 40.7128,
      "lon": -74.0060,
      "address": "New York, NY"
    },
    "departure_time": "2026-10-16T08:00:00Z",
    "load_weight_lbs": 45000,
    "checkpoint_interval_miles": 25
  }'
```

#### Response (`HTTP 202 Accepted`)
```json
{
  "job_id": "7f8b9a2c-4e1d-4a3b-9c8e-1f2a3b4c5d6e",
  "status": "PENDING",
  "poll_url": "https://weather-route-monorepo.onrender.com/api/route/7f8b9a2c-4e1d-4a3b-9c8e-1f2a3b4c5d6e/",
  "created_at": "2026-10-15T13:30:00.000Z",
  "completed_at": null,
  "error_message": null,
  "result": null
}
```

---

### 3. Poll Route Evaluation Job
Poll status and retrieve the evaluated, ranked route payload.

- **Method**: `GET`
- **Path**: `/api/route/{job_id}/`
- **Rate Throttle**: `120 requests / minute`

#### In-Progress Response (`HTTP 200 OK`)
```json
{
  "job_id": "7f8b9a2c-4e1d-4a3b-9c8e-1f2a3b4c5d6e",
  "status": "PROCESSING",
  "poll_url": "https://weather-route-monorepo.onrender.com/api/route/7f8b9a2c-4e1d-4a3b-9c8e-1f2a3b4c5d6e/",
  "created_at": "2026-10-15T13:30:00.000Z",
  "completed_at": null,
  "error_message": null,
  "result": null
}
```

#### Successful Completed Response (`HTTP 200 OK`)
```json
{
  "job_id": "7f8b9a2c-4e1d-4a3b-9c8e-1f2a3b4c5d6e",
  "status": "SUCCESS",
  "poll_url": "https://weather-route-monorepo.onrender.com/api/route/7f8b9a2c-4e1d-4a3b-9c8e-1f2a3b4c5d6e/",
  "created_at": "2026-10-15T13:30:00.000Z",
  "completed_at": "2026-10-15T13:30:04.120Z",
  "error_message": null,
  "result": {
    "job_id": "7f8b9a2c-4e1d-4a3b-9c8e-1f2a3b4c5d6e",
    "status": "SUCCESS",
    "departure_time": "2026-10-16T08:00:00+00:00",
    "load_weight_lbs": 45000,
    "origin": { "lat": 41.8781, "lon": -87.6298, "address": "Chicago, IL" },
    "destination": { "lat": 40.7128, "lon": -74.0060, "address": "New York, NY" },
    "ranked_routes": [
      {
        "route_id": "route_option_0",
        "route_summary": "I-80 E",
        "total_distance_miles": 789.4,
        "total_duration_hours": 12.4,
        "is_travel_recommended": true,
        "risk_breakdown": {
          "severe_miles": 0.0,
          "high_miles": 25.0,
          "moderate_miles": 75.0,
          "low_miles": 689.4,
          "no_travel_miles": 0.0,
          "average_risk_score": 18.4
        },
        "critical_advisories": [
          "Elevated crosswinds detected along mile marker 325-350."
        ],
        "checkpoints": [
          {
            "sequence": 0,
            "coordinates": { "lat": 41.8781, "lon": -87.6298 },
            "distance_from_origin_miles": 0.0,
            "eta": "2026-10-16T08:00:00+00:00",
            "geohash": "dp3whz",
            "weather": {
              "temperature_f": 52.0,
              "wind_speed_mph": 12.4,
              "wind_gust_mph": 18.0,
              "rain_intensity_in_hr": 0.0,
              "snow_intensity_in_hr": 0.0,
              "weather_code": 1000
            },
            "risk": {
              "overall_level": "LOW",
              "numerical_score": 10.0,
              "wind_level": "LOW",
              "rain_level": "LOW",
              "snow_level": "LOW",
              "load_warning": null
            }
          }
        ]
      }
    ],
    "evaluated_at": "2026-10-15T13:30:04.115Z"
  }
}
```

#### Failed Evaluation Response (`HTTP 200 OK`)
```json
{
  "job_id": "7f8b9a2c-4e1d-4a3b-9c8e-1f2a3b4c5d6e",
  "status": "FAILED",
  "poll_url": "https://weather-route-monorepo.onrender.com/api/route/7f8b9a2c-4e1d-4a3b-9c8e-1f2a3b4c5d6e/",
  "created_at": "2026-10-15T13:30:00.000Z",
  "completed_at": "2026-10-15T13:30:02.500Z",
  "error_message": "Mapbox Directions API returned no drivable route alternatives between origin and destination coordinates.",
  "result": null
}
```

---

### 4. Health Check
Unauthenticated liveness and readiness probe for cloud orchestrators.

- **Method**: `GET`
- **Path**: `/api/health/`
- **Response (`HTTP 200 OK`)**:
  ```json
  {
    "status": "healthy",
    "service": "weather-truck-routing"
  }
  ```

---

## 4. Reproducible Local Development Setup

### System Prerequisites
Ensure your local machine has the following tools installed:
- **Docker & Docker Compose** (v2+)
- **Python 3.12+** (Backend runtime)
- **Node.js 20+** and **npm 10+** (Frontend runtime)
- Mapbox API Token ([https://account.mapbox.com/](https://account.mapbox.com/))
- Tomorrow.io API Key ([https://app.tomorrow.io/](https://app.tomorrow.io/))

---

### Step 1: Start Local Infrastructure
Launch local PostgreSQL 16 and Redis 7 containers via Docker Compose:

```bash
docker-compose up -d
```

Verify that both containers are healthy:
```bash
docker-compose ps
```

---

### Step 2: Configure & Start Django Backend

```bash
cd backend

# Create and activate Python virtual environment
python -m venv .venv
source .venv/bin/activate

# Install dependencies (including development tools)
pip install -e ".[dev]"

# Create local environment configuration
cp .env.example .env
```

Apply database migrations:
```bash
python manage.py migrate
```

Start the Django development server:
```bash
python manage.py runserver 0.0.0.0:8000
```
*The API is now accessible at `http://127.0.0.1:8000/api/health/`.*

---

### Step 3: Start Celery Background Worker
In a separate terminal, start the asynchronous Celery routing worker:

```bash
cd backend
source .venv/bin/activate

celery -A config worker --loglevel=INFO --concurrency=4
```

---

### Step 4: Configure & Start Frontend

In a third terminal, configure and start the React client:

```bash
cd frontend

# Install npm packages
npm install

# Create environment configuration
cp env.example .env
```

Start Vite local development server:
```bash
npm run dev
```
*The web application is now running at `http://localhost:5173` (or `http://localhost:3000`).*

---

### Environment Variable References

#### Backend Environment Variables (`backend/.env`)
| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `DJANGO_SETTINGS_MODULE` | Yes | `config.settings.local` | Django settings profile (`local` or `production`). |
| `SECRET_KEY` | Yes | `django-insecure-...` | Cryptographic signing key for sessions and tokens. |
| `DEBUG` | Yes | `True` | Enables debug mode and stack traces (set `False` in prod). |
| `ALLOWED_HOSTS` | Yes | `localhost,127.0.0.1,0.0.0.0` | Host header security whitelist. |
| `DATABASE_URL` | Yes | `postgres://postgres:postgres@localhost:5432/weather_truck_db` | Relational database connection string. |
| `UPSTASH_REDIS_URL` | Yes | `redis://localhost:6379/0` | Redis connection URL for Celery broker and caching. |
| `MAPBOX_ACCESS_TOKEN` | Yes | `pk.eyJ1Ijo...` | Upstream Mapbox Places and Directions API token. |
| `TOMORROW_IO_API_KEY` | Yes | `your_key_here` | Upstream Tomorrow.io Timelines weather forecast API key. |
| `CORS_ALLOWED_ORIGINS`| No | `http://localhost:5173,http://127.0.0.1:3000` | Whitelisted cross-origin domains. |

#### Frontend Environment Variables (`frontend/.env`)
| Variable | Required | Default / Example | Purpose |
| :--- | :---: | :--- | :--- |
| `VITE_MAPBOX_ACCESS_TOKEN` | Yes | `pk.eyJ1Ijo...` | Public Mapbox token for loading vector tiles in Mapbox GL. |
| `VITE_API_URL` | Yes | `http://127.0.0.1:8000/api` | Backend API base URL for route evaluation and geocoding. |

---

## 5. Testing, Verification & Code Quality

### Backend Test Suite
The backend is thoroughly validated with **54 automated tests** covering:
- Geocoding autocomplete cache hits, misses, and negative query caching.
- Celery task dispatch, cache reuse, and asynchronous result persistence.
- Polyline coordinate sampling and temporal rounding.
- Redis distributed lock acquisition and release under concurrency.
- Aerodynamic wind tipping thresholds and heavy gross load braking limits.
- Deterministic route sorting and tie-breaker hierarchy.

Run the test suite with coverage:
```bash
cd backend
source .venv/bin/activate
pytest -v
```

Expected output:
```text
============================== 54 passed in 2.15s ==============================
```

### Static Analysis & Linters
Run code formatters and style checkers:
```bash
cd backend
source .venv/bin/activate

# Verify import ordering with isort
isort --check-only .

# Check PEP 8 compliance with Flake8
flake8 .
```

### Frontend Typecheck & Production Build
Validate TypeScript typings and build the production bundle:
```bash
cd frontend

# TypeScript static analysis
npx tsc --noEmit

# Production Vite build
npm run build
```

---

## 6. Production Cloud Deployment Architecture

WeatherRoute is deployed using modern cloud primitives across compute, data, and edge caching:

```text
┌────────────────────────────────┐       ┌────────────────────────────────┐
│          Vercel Edge           │       │          Render Cloud          │
│   React 19 SPA (Static CDN)    │ ────> │       Django REST API          │
│ weather-route-eight.vercel.app │       │   Gunicorn + Whitenoise WSGI   │
└────────────────────────────────┘       └──────────────┬─────────────────┘
                                                        │
                      ┌─────────────────────────────────┼──────────────────────────────┐
                      │                                 │                              │
                      ▼                                 ▼                              ▼
        ┌──────────────────────────┐      ┌───────────────────────────┐  ┌───────────────────────────┐
        │       Render Worker      │      │     Neon Serverless DB    │  │    Upstash Redis (TLS)    │
        │ Celery Asynchronous Queue│ ───> │   PostgreSQL 16 Storage   │  │   Broker, Cache & Locks   │
        └──────────────────────────┘      │  (Jobs & Route Payloads)  │  │        (rediss://)        │
                                          └───────────────────────────┘  └───────────────────────────┘
```

1. **Frontend (Vercel)**:
   - Hosted at `https://weather-route-eight.vercel.app`.
   - Single-Page Application (SPA) routing managed via `vercel.json` rewrites.
2. **Backend API (Render Web Service)**:
   - Hosted at `https://weather-route-monorepo.onrender.com`.
   - Managed via `render.yaml` and initialized using `start.sh` (executes database migrations, static asset collection, and launches Gunicorn with 2 workers and 2 threads).
3. **Background Worker (Render Worker)**:
   - Executes Celery worker processes to asynchronously evaluate weather forecasts and route alternatives.
4. **Relational Database (Neon PostgreSQL)**:
   - Serverless PostgreSQL with SSL connection pooling, storing `RouteEvaluationJob` execution states and ranked route payloads.
5. **Distributed Cache & Broker (Upstash Redis)**:
   - High-performance Redis cluster connected over TLS (`rediss://`), providing sub-millisecond geocode caching, weather timeline caching, and `SET NX PX` distributed locks.

---

## 7. License & Credits

- Licensed under the **MIT License**. See [LICENSE](LICENSE) for details.
- Map data & directions provided by [Mapbox](https://www.mapbox.com/).
- Real-time and forecasted weather data provided by [Tomorrow.io](https://www.tomorrow.io/).
