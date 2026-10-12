"""Ranking engine for multi-criteria route evaluation."""

from typing import Any, Dict, List

from routing.services.risk_engine import RiskLevel


class RankingEngine:
    """Ranks alternative routes by risk exposure and travel duration."""

    @classmethod
    def evaluate_route_statistics(
        cls,
        checkpoints: List[Dict[str, Any]],
        total_distance_miles: float,
        interval_miles: float,
    ) -> Dict[str, Any]:
        """Compute aggregate risk breakdown and miles per category for a route."""
        if not checkpoints:
            return {
                "severe_miles": 0.0,
                "high_miles": 0.0,
                "moderate_miles": 0.0,
                "low_miles": 0.0,
                "no_travel_miles": 0.0,
                "average_risk_score": 1.0,
                "has_no_travel": False,
            }

        counts = {
            RiskLevel.LOW: 0,
            RiskLevel.MODERATE: 0,
            RiskLevel.HIGH: 0,
            RiskLevel.SEVERE: 0,
            RiskLevel.NO_TRAVEL: 0,
        }
        total_score = 0
        advisories: List[str] = []

        for cp in checkpoints:
            risk_info = cp.get("risk", {})
            lvl = risk_info.get("overall_level", RiskLevel.LOW.value)
            score = risk_info.get("numerical_score", 1)
            total_score += score

            try:
                risk_enum = RiskLevel(lvl)
                counts[risk_enum] += 1
            except ValueError:
                counts[RiskLevel.LOW] += 1

            load_warn = risk_info.get("load_warning")
            if load_warn:
                mile_marker = cp.get("distance_from_origin_miles")
                advisories.append(f"Checkpoint at mile {mile_marker}: {load_warn}")

        num_checkpoints = len(checkpoints)
        avg_score = round(total_score / num_checkpoints, 2)

        # Proportional miles estimation
        miles_per_cp = total_distance_miles / num_checkpoints

        severe_miles = round(counts[RiskLevel.SEVERE] * miles_per_cp, 1)
        high_miles = round(counts[RiskLevel.HIGH] * miles_per_cp, 1)
        moderate_miles = round(counts[RiskLevel.MODERATE] * miles_per_cp, 1)
        low_miles = round(counts[RiskLevel.LOW] * miles_per_cp, 1)
        no_travel_miles = round(counts[RiskLevel.NO_TRAVEL] * miles_per_cp, 1)

        has_no_travel = counts[RiskLevel.NO_TRAVEL] > 0

        return {
            "severe_miles": severe_miles,
            "high_miles": high_miles,
            "moderate_miles": moderate_miles,
            "low_miles": low_miles,
            "no_travel_miles": no_travel_miles,
            "average_risk_score": avg_score,
            "has_no_travel": has_no_travel,
            "advisories": advisories,
        }

    @classmethod
    def rank_routes(
        cls, evaluated_routes: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Rank routes according to:
        1. Fewest Severe miles (and No Travel miles)
        2. Fewest High miles
        3. Lowest average risk score
        4. Shortest travel time (total_duration_hours)
        """

        def ranking_key(route: Dict[str, Any]):
            rb = route.get("risk_breakdown", {})
            # Treat No Travel miles as highest penalty + severe miles
            penalty_severe = rb.get("no_travel_miles", 0.0) * 100.0 + rb.get(
                "severe_miles", 0.0
            )
            return (
                penalty_severe,
                rb.get("high_miles", 0.0),
                rb.get("average_risk_score", 1.0),
                route.get("total_duration_hours", 0.0),
            )

        sorted_routes = sorted(evaluated_routes, key=ranking_key)
        for idx, r in enumerate(sorted_routes, start=1):
            r["rank"] = idx

        return sorted_routes
