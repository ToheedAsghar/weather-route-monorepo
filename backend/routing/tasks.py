"""Celery background tasks for orchestrating weather-aware route evaluations."""

import concurrent.futures
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

        # 2. Segment polyline into checkpoints for each route and collect unique checkpoints
        route_data_list = []
        unique_checkpoints = {}  # key: (geohash, rounded_eta) -> (lat, lon)

        for r_idx, raw_route in enumerate(routes_raw, start=1):
            geom = raw_route.get("geometry", {})
            coords = geom.get("coordinates", [])
            dist_meters = float(raw_route.get("distance", 0.0))
            duration_seconds = float(raw_route.get("duration", 0.0))

            dist_miles = round(dist_meters / 1609.34, 2)
            duration_hours = round(duration_seconds / 3600.0, 2)
            summary = raw_route.get("summary", f"Route Alternative {r_idx}")

            checkpoints = PolylineService.segment_route(
                coordinates=coords,
                total_distance_miles=dist_miles,
                total_duration_seconds=duration_seconds,
                departure_time=dep_time,
                interval_miles=interval_miles,
            )

            route_data_list.append(
                {
                    "idx": r_idx,
                    "summary": summary,
                    "dist_miles": dist_miles,
                    "duration_hours": duration_hours,
                    "checkpoints": checkpoints,
                }
            )

            for cp in checkpoints:
                key = (cp["geohash"], cp["rounded_eta"])
                if key not in unique_checkpoints:
                    unique_checkpoints[key] = (
                        cp["coordinates"]["lat"],
                        cp["coordinates"]["lon"],
                    )

        # 3. Geo-temporal weather querying with deduplication and concurrent fetching
        weather_by_key = {}
        misses = []

        for (geohash, rounded_eta), (lat, lon) in unique_checkpoints.items():
            cached_data = cache_manager.get_weather(geohash, rounded_eta)
            if cached_data is not None:
                weather_by_key[(geohash, rounded_eta)] = cached_data
            else:
                misses.append((geohash, rounded_eta, lat, lon))

        if misses:
            def _fetch_single_checkpoint(gh: str, eta: str, lat_val: float, lon_val: float):
                # Double-check cache in case another worker already populated it
                data = cache_manager.get_weather(gh, eta)
                if data is not None:
                    return (gh, eta), data

                worker_token = str(uuid.uuid4())
                lock_acquired = cache_manager.acquire_lock(
                    gh, eta, worker_token, timeout_ms=8000
                )
                if lock_acquired:
                    try:
                        data = tomorrow_service.fetch_weather(
                            lat=lat_val,
                            lon=lon_val,
                            target_time_iso=eta,
                        )
                        cache_manager.set_weather(gh, eta, data)
                        return (gh, eta), data
                    finally:
                        cache_manager.release_lock(gh, eta, worker_token)
                else:
                    time.sleep(0.2)
                    data = cache_manager.get_weather(gh, eta)
                    if data is None:
                        data = tomorrow_service.fetch_weather(
                            lat=lat_val,
                            lon=lon_val,
                            target_time_iso=eta,
                        )
                    return (gh, eta), data

            max_workers = min(len(misses), 8)
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
                future_to_key = {
                    executor.submit(
                        _fetch_single_checkpoint, gh, eta, lat_val, lon_val
                    ): (gh, eta)
                    for gh, eta, lat_val, lon_val in misses
                }
                for future in concurrent.futures.as_completed(future_to_key):
                    key, data = future.result()
                    weather_by_key[key] = data

        # 4. Evaluate weather hazard thresholds, truck load rules, and route statistics
        evaluated_routes = []
        for route_info in route_data_list:
            evaluated_checkpoints = []
            for cp in route_info["checkpoints"]:
                geohash = cp["geohash"]
                rounded_eta = cp["rounded_eta"]
                weather_data = weather_by_key.get((geohash, rounded_eta), {})

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

            stats = RankingEngine.evaluate_route_statistics(
                checkpoints=evaluated_checkpoints,
                total_distance_miles=route_info["dist_miles"],
                interval_miles=interval_miles,
            )

            evaluated_routes.append(
                {
                    "route_id": f"route_option_{route_info['idx']}",
                    "route_summary": route_info["summary"],
                    "total_distance_miles": route_info["dist_miles"],
                    "total_duration_hours": route_info["duration_hours"],
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
