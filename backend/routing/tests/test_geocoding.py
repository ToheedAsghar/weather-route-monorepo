"""Unit and integration tests for geocoding autocomplete service, caching, and rate limiting."""

from unittest.mock import MagicMock, patch

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from routing.services.geocoding_service import GeocodingService


class TestGeocodingService(APITestCase):
    """Tests for GeocodingService caching and Mapbox interaction."""

    def test_short_query_returns_empty_list(self):
        service = GeocodingService(redis_client=MagicMock())
        results = service.search_places("ka")
        self.assertEqual(results, [])

    def test_cache_hit_bypasses_external_api(self):
        mock_redis = MagicMock()
        mock_redis.get.return_value = '[{"id": "place.1", "place_name": "Cached City", "lat": 10.0, "lon": 20.0}]'

        service = GeocodingService(redis_client=mock_redis)
        with patch.object(service, "_fetch_from_mapbox") as mock_fetch:
            results = service.search_places("cached city")
            mock_fetch.assert_not_called()
            self.assertEqual(len(results), 1)
            self.assertEqual(results[0]["place_name"], "Cached City")

    def test_cache_miss_fetches_and_caches_with_ttl(self):
        mock_redis = MagicMock()
        mock_redis.get.return_value = None

        service = GeocodingService(redis_client=mock_redis, ttl_seconds=3600)
        sample_results = [{"id": "place.2", "place_name": "New City", "lat": 15.0, "lon": 25.0}]

        with patch.object(service, "_fetch_from_mapbox", return_value=sample_results):
            results = service.search_places("new city")
            self.assertEqual(results, sample_results)
            mock_redis.setex.assert_called_once()
            args, _ = mock_redis.setex.call_args
            self.assertEqual(args[0], "geocode:query:new city")
            self.assertEqual(args[1], 3600)


class TestGeocodeAutocompleteEndpoint(APITestCase):
    """API view integration tests for geocode autocomplete."""

    def test_get_short_query_returns_empty_array(self):
        url = reverse("routing:geocode-autocomplete")
        response = self.client.get(url, {"q": "ab"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), [])

    @patch("routing.services.geocoding_service.GeocodingService.search_places")
    def test_get_valid_query_returns_suggestions(self, mock_search):
        mock_search.return_value = [
            {"id": "place.10", "place_name": "Lahore, Pakistan", "lat": 31.52, "lon": 74.35}
        ]
        url = reverse("routing:geocode-autocomplete")
        response = self.client.get(url, {"q": "lahore"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["place_name"], "Lahore, Pakistan")
