"""Celery background tasks for orchestrating weather-aware route evaluations."""

import logging
import time
import uuid

from celery import shared_task
from django.utils import timezone

from .models import RouteEvaluationJob
from .services.mapbox_service import MapboxService
from .services.polyline_service import PolylineService
from .services.ranking_engine import RankingEngine
from .services.risk_engine import RiskEngine
from .services.tomorrow_service import TomorrowService
from .services.weather_cache import WeatherCacheManager

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    name="routing.tasks.evaluate_route_weather",
)
def evaluate_route_weather(self, job_id: str):
    """Orchestrate fetching 3 Mapbox routes, segmenting into checkpoints,

    querying geo-temporal weather with stampede locking, evaluating risks,
    and ranking routes.
    """
    try:
        job = RouteEvaluationJob.objects.get(id=job_id)
    except RouteEvaluationJob.DoesNotExist:
        logger.error(f"RouteEvaluationJob with ID {job_id} not found.")
        return

    job.mark_processing()

    try:
        mapbox_service = MapboxService()
        tomorrow_service = TomorrowService()
        cache_manager = WeatherCacheManager()

        origin = job.origin
        destination = job.destination
        dep_time = job.departure_time
        load_weight = job.load_weight_lbs
        interval_miles = job.checkpoint_interval_miles

        # 1. Fetch 3 route options from Mapbox
        routes_raw = mapbox_service.fetch_routes(
            origin_lat=origin["lat"],
            origin_lon=origin["lon"],
            dest_lat=destination["lat"],
            dest_lon=destination["lon"],
        )

        if not routes_raw:
            job.mark_failed("No viable driving routes returned by Mapbox.")
            return

        evaluated_routes = []

        for r_idx, raw_route in enumerate(routes_raw, start=1):
            geom = raw_route.get("geometry", {})
            coords = geom.get("coordinates", [])
            dist_meters = float(raw_route.get("distance", 0.0))
            duration_seconds = float(raw_route.get("duration", 0.0))

            dist_miles = round(dist_meters / 1609.34, 2)
            duration_hours = round(duration_seconds / 3600.0, 2)
            summary = raw_route.get("summary", f"Route Alternative {r_idx}")

            # 2. Segment polyline into checkpoints every interval_miles
            checkpoints = PolylineService.segment_route(
                coordinates=coords,
                total_distance_miles=dist_miles,
                total_duration_seconds=duration_seconds,
                departure_time=dep_time,
                interval_miles=interval_miles,
            )

            # 3. Geo-temporal weather querying with stampede protection
            evaluated_checkpoints = []
            for cp in checkpoints:
                geohash = cp["geohash"]
                rounded_eta = cp["rounded_eta"]
                lat = cp["coordinates"]["lat"]
                lon = cp["coordinates"]["lon"]

                # Cache lookup
                weather_data = cache_manager.get_weather(geohash, rounded_eta)

                if weather_data is None:
                    # Cache miss: acquire distributed lock to prevent cache stampede
                    worker_token = str(uuid.uuid4())
                    lock_acquired = cache_manager.acquire_lock(
                        geohash, rounded_eta, worker_token, timeout_ms=8000
                    )

                    if lock_acquired:
                        try:
                            weather_data = tomorrow_service.fetch_weather(
                                lat=lat,
                                lon=lon,
                                target_time_iso=rounded_eta,
                            )
                            cache_manager.set_weather(
                                geohash, rounded_eta, weather_data
                            )
                        finally:
                            cache_manager.release_lock(
                                geohash, rounded_eta, worker_token
                            )
                    else:
                        # Another worker is currently fetching: short wait & re-check
                        time.sleep(0.2)
                        weather_data = cache_manager.get_weather(geohash, rounded_eta)
                        if weather_data is None:
                            # Fallback fetch if lock holder timed out
                            weather_data = tomorrow_service.fetch_weather(
                                lat=lat,
                                lon=lon,
                                target_time_iso=rounded_eta,
                            )

                # 4. Evaluate weather hazard thresholds and truck load rules
                wind_speed = weather_data.get("wind_speed_mph", 0.0)
                rain_rate = weather_data.get("rain_intensity_in_hr", 0.0)
                snow_rate = weather_data.get("snow_intensity_in_hr", 0.0)

                risk_eval = RiskEngine.evaluate_checkpoint(
                    wind_mph=wind_speed,
                    rain_in_hr=rain_rate,
                    snow_in_hr=snow_rate,
                    load_weight_lbs=load_weight,
                )

                cp_evaluated = {
                    "sequence": cp["sequence"],
                    "coordinates": cp["coordinates"],
                    "distance_from_origin_miles": cp["distance_from_origin_miles"],
                    "eta": cp["eta"],
                    "geohash": geohash,
                    "weather": weather_data,
                    "risk": {
                        "overall_level": risk_eval.overall_level.value,
                        "numerical_score": risk_eval.numerical_score,
                        "wind_level": risk_eval.wind_level.value,
                        "rain_level": risk_eval.rain_level.value,
                        "snow_level": risk_eval.snow_level.value,
                        "load_warning": risk_eval.load_warning,
                    },
                }
                evaluated_checkpoints.append(cp_evaluated)

            # 5. Route statistics
            stats = RankingEngine.evaluate_route_statistics(
                checkpoints=evaluated_checkpoints,
                total_distance_miles=dist_miles,
                interval_miles=interval_miles,
            )

            evaluated_routes.append(
                {
                    "route_id": f"route_option_{r_idx}",
                    "route_summary": summary,
                    "total_distance_miles": dist_miles,
                    "total_duration_hours": duration_hours,
                    "is_travel_recommended": not stats["has_no_travel"],
                    "risk_breakdown": {
                        "severe_miles": stats["severe_miles"],
                        "high_miles": stats["high_miles"],
                        "moderate_miles": stats["moderate_miles"],
                        "low_miles": stats["low_miles"],
                        "no_travel_miles": stats["no_travel_miles"],
                        "average_risk_score": stats["average_risk_score"],
                    },
                    "critical_advisories": stats["advisories"],
                    "checkpoints": evaluated_checkpoints,
                }
            )

        # 6. Rank routes deterministically
        ranked_routes = RankingEngine.rank_routes(evaluated_routes)

        # 7. Final evaluated payload
        payload = {
            "job_id": str(job.id),
            "status": "SUCCESS",
            "departure_time": dep_time.isoformat(),
            "load_weight_lbs": load_weight,
            "origin": origin,
            "destination": destination,
            "ranked_routes": ranked_routes,
            "evaluated_at": timezone.now().isoformat(),
        }

        job.mark_success(payload)
        logger.info(
            "Completed RouteEvaluationJob %s with %d ranked routes.",
            job.id,
            len(ranked_routes),
        )

    except Exception as exc:
        logger.exception(f"Error evaluating RouteEvaluationJob {job.id}: {exc}")
        job.mark_failed(str(exc))
        raise exc
