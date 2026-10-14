"""Domain constants for weather routing, vehicle parameters, and checkpoint sampling."""

# Checkpoint intervals (miles)
DEFAULT_CHECKPOINT_INTERVAL_MILES: int = 25
ALLOWED_CHECKPOINT_INTERVAL_MILES: list[int] = [10, 25, 50]

# Gross truck load weight limits (lbs)
MIN_LOAD_WEIGHT_LBS: int = 1
MAX_LOAD_WEIGHT_LBS: int = 150_000

# Geographic coordinate bounds
MIN_LATITUDE: float = -90.0
MAX_LATITUDE: float = 90.0
MIN_LONGITUDE: float = -180.0
MAX_LONGITUDE: float = 180.0
MAX_ADDRESS_LENGTH: int = 255

# Weather projection lookahead window (hours)
DEFAULT_WEATHER_WINDOW_HOURS: int = 48

# Shared model & serializer field descriptions
HELP_TEXT_LOAD_WEIGHT_LBS: str = "Gross truck load weight in pounds"
HELP_TEXT_DEPARTURE_TIME: str = "Truck scheduled departure datetime in ISO 8601 format"
HELP_TEXT_CHECKPOINT_INTERVAL: str = (
    f"Interval in miles between weather checkpoints ({', '.join(map(str, ALLOWED_CHECKPOINT_INTERVAL_MILES))})"
)
HELP_TEXT_ORIGIN: str = "Trip origin coordinate"
HELP_TEXT_DESTINATION: str = "Trip destination coordinate"
HELP_TEXT_COORDINATE_JSON: str = "{'lat': float, 'lon': float, 'address': str}"
HELP_TEXT_RESULT_PAYLOAD: str = "Complete evaluated payload with ranked routes"
HELP_TEXT_ERROR_MESSAGE: str = "Diagnostic error details if the job failed"
