"""Integration tests for API Gateway and polling views."""

import pytest
from rest_framework.test import APIClient

from routing.models import JobStatus, RouteEvaluationJob


@pytest.mark.django_db
class TestRouteViews:
    """Test API Gateway endpoint and polling endpoint."""

    def setup_method(self):
        self.client = APIClient()

    def test_post_gateway_endpoint_accepted(self, sample_route_request, mocker):
        # Mock Celery delay to prevent real worker execution in view unit test
        mock_task = mocker.patch("routing.views.evaluate_route_weather.delay")

        response = self.client.post(
            "/api/route/",
            data=sample_route_request,
            format="json",
        )

        assert response.status_code == 202
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "PENDING"
        assert "/api/route/" in data["poll_url"]

        # Verify job was created in database
        job = RouteEvaluationJob.objects.get(id=data["job_id"])
        assert job.status == JobStatus.PENDING
        assert job.load_weight_lbs == 42000

        # Verify Celery task was dispatched with job_id
        mock_task.assert_called_once_with(job_id=str(job.id))

    def test_post_gateway_validation_errors(self):
        # Missing destination and negative load weight
        invalid_payload = {
            "origin": {"lat": 41.8781, "lon": -87.6298},
            "departure_time": "2026-10-15T08:00:00Z",
            "load_weight_lbs": -500,
        }
        response = self.client.post(
            "/api/route/",
            data=invalid_payload,
            format="json",
        )
        assert response.status_code == 400
        errors = response.json()
        assert "destination" in errors
        assert "load_weight_lbs" in errors

    def test_get_polling_endpoint(self, sample_route_request):
        job = RouteEvaluationJob.objects.create(
            origin=sample_route_request["origin"],
            destination=sample_route_request["destination"],
            departure_time=sample_route_request["departure_time"],
            load_weight_lbs=sample_route_request["load_weight_lbs"],
            status=JobStatus.SUCCESS,
            result_payload={"ranked_routes": [{"rank": 1, "route_id": "test"}]},
        )

        response = self.client.get(f"/api/route/{job.id}/")
        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == str(job.id)
        assert data["status"] == "SUCCESS"
        assert data["result"]["ranked_routes"][0]["rank"] == 1

    def test_get_polling_not_found(self):
        import uuid

        random_id = uuid.uuid4()
        response = self.client.get(f"/api/route/{random_id}/")
        assert response.status_code == 404
