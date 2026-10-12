"""Unit tests for exact risk evaluation thresholds and truck load rules."""

import pytest

from routing.services.risk_engine import RiskEngine, RiskLevel


class TestRiskEngine:
    """Validate all weather thresholds and commercial vehicle load escalation rules."""

    @pytest.mark.parametrize(
        "wind_mph, expected",
        [
            (10.0, RiskLevel.LOW),
            (24.9, RiskLevel.LOW),
            (25.0, RiskLevel.MODERATE),
            (34.0, RiskLevel.MODERATE),
            (35.0, RiskLevel.HIGH),
            (44.0, RiskLevel.HIGH),
            (45.0, RiskLevel.SEVERE),
            (54.0, RiskLevel.SEVERE),
            (55.0, RiskLevel.NO_TRAVEL),
            (70.0, RiskLevel.NO_TRAVEL),
        ],
    )
    def test_wind_thresholds(self, wind_mph, expected):
        assert RiskEngine.evaluate_wind(wind_mph) == expected

    @pytest.mark.parametrize(
        "rain_in_hr, expected",
        [
            (0.05, RiskLevel.LOW),
            (0.09, RiskLevel.LOW),
            (0.10, RiskLevel.MODERATE),
            (0.25, RiskLevel.MODERATE),
            (0.26, RiskLevel.HIGH),
            (0.50, RiskLevel.HIGH),
            (0.51, RiskLevel.SEVERE),
            (1.00, RiskLevel.SEVERE),
            (1.01, RiskLevel.NO_TRAVEL),
            (2.50, RiskLevel.NO_TRAVEL),
        ],
    )
    def test_rain_thresholds(self, rain_in_hr, expected):
        assert RiskEngine.evaluate_rain(rain_in_hr) == expected

    @pytest.mark.parametrize(
        "snow_in_hr, expected",
        [
            (0.2, RiskLevel.LOW),
            (0.49, RiskLevel.LOW),
            (0.50, RiskLevel.MODERATE),
            (1.00, RiskLevel.MODERATE),
            (1.01, RiskLevel.HIGH),
            (2.00, RiskLevel.HIGH),
            (2.01, RiskLevel.SEVERE),
            (3.00, RiskLevel.SEVERE),
            (3.01, RiskLevel.NO_TRAVEL),
            (5.00, RiskLevel.NO_TRAVEL),
        ],
    )
    def test_snow_thresholds(self, snow_in_hr, expected):
        assert RiskEngine.evaluate_snow(snow_in_hr) == expected

    def test_load_rule_extreme_wind_no_travel(self):
        """Rule 1: >= 55 mph = No Travel, regardless of weight."""
        res_light = RiskEngine.evaluate_checkpoint(
            wind_mph=56.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lbs=10000
        )
        assert res_light.overall_level == RiskLevel.NO_TRAVEL
        assert res_light.numerical_score == 5
        assert res_light.load_warning is not None

        res_heavy = RiskEngine.evaluate_checkpoint(
            wind_mph=60.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lbs=65000
        )
        assert res_heavy.overall_level == RiskLevel.NO_TRAVEL

    def test_load_rule_severe_wind_heavy_load_no_travel(self):
        """Rule 2: 45-54 mph + > 30,000 lb = No Travel."""
        # 48 mph + 35,000 lb -> NO TRAVEL
        res_no_travel = RiskEngine.evaluate_checkpoint(
            wind_mph=48.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lbs=35000
        )
        assert res_no_travel.overall_level == RiskLevel.NO_TRAVEL
        assert "30,000 lbs" in res_no_travel.load_warning

        # 48 mph + 25,000 lb -> SEVERE (standard wind level without escalation)
        res_severe = RiskEngine.evaluate_checkpoint(
            wind_mph=48.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lbs=25000
        )
        assert res_severe.overall_level == RiskLevel.SEVERE

    def test_load_rule_high_wind_escalation_to_severe(self):
        """Rule 3: 35-44 mph + > 40,000 lb = Severe."""
        # 40 mph + 45,000 lb -> SEVERE
        res_escalated = RiskEngine.evaluate_checkpoint(
            wind_mph=40.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lbs=45000
        )
        assert res_escalated.overall_level == RiskLevel.SEVERE
        assert res_escalated.numerical_score == 4
        assert "Escalated to SEVERE" in res_escalated.load_warning

        # 40 mph + 35,000 lb -> HIGH (standard wind level)
        res_normal = RiskEngine.evaluate_checkpoint(
            wind_mph=40.0, rain_in_hr=0.0, snow_in_hr=0.0, load_weight_lbs=35000
        )
        assert res_normal.overall_level == RiskLevel.HIGH
        assert res_normal.load_warning is None

    def test_composite_risk_max_hazard(self):
        """Composite risk correctly selects maximum hazard among rain, snow, wind."""
        res = RiskEngine.evaluate_checkpoint(
            wind_mph=15.0,  # LOW
            rain_in_hr=0.60,  # SEVERE
            snow_in_hr=0.0,  # LOW
            load_weight_lbs=20000,
        )
        assert res.overall_level == RiskLevel.SEVERE
        assert res.rain_level == RiskLevel.SEVERE
        assert res.wind_level == RiskLevel.LOW
