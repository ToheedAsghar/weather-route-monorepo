"""Unit tests for the multi-criteria route ranking engine."""

from routing.services.ranking_engine import RankingEngine


class TestRankingEngine:
    """Validate route sorting hierarchy and statistics aggregation."""

    def test_ranking_hierarchy(self):
        # Route A: 25 Severe miles, 0 High miles, 2.0 avg risk, 10.0 hours
        # Route B: 0 Severe miles, 50 High miles, 2.5 avg risk, 12.0 hours
        # Route C: 0 Severe miles, 10 High miles, 1.8 avg risk, 11.5 hours
        # Expected rank order: C (1st), B (2nd), A (3rd because of severe miles)
        routes = [
            {
                "route_id": "route_A",
                "total_duration_hours": 10.0,
                "risk_breakdown": {
                    "severe_miles": 25.0,
                    "high_miles": 0.0,
                    "average_risk_score": 2.0,
                    "no_travel_miles": 0.0,
                },
            },
            {
                "route_id": "route_B",
                "total_duration_hours": 12.0,
                "risk_breakdown": {
                    "severe_miles": 0.0,
                    "high_miles": 50.0,
                    "average_risk_score": 2.5,
                    "no_travel_miles": 0.0,
                },
            },
            {
                "route_id": "route_C",
                "total_duration_hours": 11.5,
                "risk_breakdown": {
                    "severe_miles": 0.0,
                    "high_miles": 10.0,
                    "average_risk_score": 1.8,
                    "no_travel_miles": 0.0,
                },
            },
        ]

        ranked = RankingEngine.rank_routes(routes)

        assert ranked[0]["route_id"] == "route_C"
        assert ranked[0]["rank"] == 1
        assert ranked[1]["route_id"] == "route_B"
        assert ranked[1]["rank"] == 2
        assert ranked[2]["route_id"] == "route_A"
        assert ranked[2]["rank"] == 3

    def test_duration_tie_breaker(self):
        # When severe, high, and avg risk are identical, shortest duration wins
        routes = [
            {
                "route_id": "route_slow",
                "total_duration_hours": 14.0,
                "risk_breakdown": {
                    "severe_miles": 0.0,
                    "high_miles": 0.0,
                    "average_risk_score": 1.2,
                    "no_travel_miles": 0.0,
                },
            },
            {
                "route_id": "route_fast",
                "total_duration_hours": 11.0,
                "risk_breakdown": {
                    "severe_miles": 0.0,
                    "high_miles": 0.0,
                    "average_risk_score": 1.2,
                    "no_travel_miles": 0.0,
                },
            },
        ]

        ranked = RankingEngine.rank_routes(routes)
        assert ranked[0]["route_id"] == "route_fast"
        assert ranked[1]["route_id"] == "route_slow"
