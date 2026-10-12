"""Tomorrow.io Timelines API client for weather forecast extraction."""

import logging
from typing import Any, Dict, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

TOMORROW_API_URL = "https://api.tomorrow.io/v4/timelines"


class TomorrowService:
    """Client for fetching weather forecast timelines from Tomorrow.io API."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or getattr(settings, "TOMORROW_IO_API_KEY", "")

    def fetch_weather(
        self, lat: float, lon: float, target_time_iso: str
    ) -> Dict[str, Any]:
        """Fetch timeline weather for coordinate and target time in imperial units."""
        params = {
            "location": f"{lat},{lon}",
            "fields": [
                "temperature",
                "windSpeed",
                "windGust",
                "precipitationIntensity",
                "snowIntensity",
                "weatherCode",
            ],
            "units": "imperial",
            "timesteps": "1h",
            "startTime": target_time_iso,
            "apikey": self.api_key,
        }

        try:
            response = requests.get(TOMORROW_API_URL, params=params, timeout=8.0)
            response.raise_for_status()
            data = response.json()
            timelines = data.get("data", {}).get("timelines", [])
            if timelines and timelines[0].get("intervals"):
                values = timelines[0]["intervals"][0].get("values", {})
                return {
                    "temperature_f": float(values.get("temperature", 60.0)),
                    "wind_speed_mph": float(values.get("windSpeed", 0.0)),
                    "wind_gust_mph": float(values.get("windGust", 0.0)),
                    "rain_intensity_in_hr": float(
                        values.get("precipitationIntensity", 0.0)
                    ),
                    "snow_intensity_in_hr": float(values.get("snowIntensity", 0.0)),
                    "weather_code": int(values.get("weatherCode", 1000)),
                }
        except Exception as exc:
            logger.error(
                "Tomorrow.io request failed for (%s, %s) at %s: %s",
                lat,
                lon,
                target_time_iso,
                exc,
            )
            # Safe default fallback in case of rate limit or network error
            return {
                "temperature_f": 60.0,
                "wind_speed_mph": 10.0,
                "wind_gust_mph": 15.0,
                "rain_intensity_in_hr": 0.0,
                "snow_intensity_in_hr": 0.0,
                "weather_code": 1000,
            }

        return {
            "temperature_f": 60.0,
            "wind_speed_mph": 10.0,
            "wind_gust_mph": 15.0,
            "rain_intensity_in_hr": 0.0,
            "snow_intensity_in_hr": 0.0,
            "weather_code": 1000,
        }
