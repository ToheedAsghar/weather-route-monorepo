"""Risk evaluation engine implementing exact weather thresholds and truck load rules."""

from dataclasses import dataclass
from enum import Enum
from typing import Optional


class RiskLevel(str, Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    SEVERE = "SEVERE"
    NO_TRAVEL = "NO_TRAVEL"


RISK_NUMERICAL = {
    RiskLevel.LOW: 1,
    RiskLevel.MODERATE: 2,
    RiskLevel.HIGH: 3,
    RiskLevel.SEVERE: 4,
    RiskLevel.NO_TRAVEL: 5,
}


@dataclass
class CheckpointRiskResult:
    overall_level: RiskLevel
    numerical_score: int
    wind_level: RiskLevel
    rain_level: RiskLevel
    snow_level: RiskLevel
    load_warning: Optional[str] = None


class RiskEngine:
    """Evaluates weather hazards and truck weight physics."""

    @staticmethod
    def evaluate_wind(wind_mph: float) -> RiskLevel:
        """Wind: <25 (Low), 25-34 (Mod), 35-44 (High), 45-54 (Sev), >=55 (No Travel)."""
        if wind_mph < 25.0:
            return RiskLevel.LOW
        elif wind_mph < 35.0:
            return RiskLevel.MODERATE
        elif wind_mph < 45.0:
            return RiskLevel.HIGH
        elif wind_mph < 55.0:
            return RiskLevel.SEVERE
        else:
            return RiskLevel.NO_TRAVEL

    @staticmethod
    def evaluate_rain(rain_in_hr: float) -> RiskLevel:
        """Rain: <0.10 (Low), 0.10-0.25 (Mod), 0.25-0.50 (High), 0.5-1 (Sev), >1.0."""
        if rain_in_hr < 0.10:
            return RiskLevel.LOW
        elif rain_in_hr <= 0.25:
            return RiskLevel.MODERATE
        elif rain_in_hr <= 0.50:
            return RiskLevel.HIGH
        elif rain_in_hr <= 1.00:
            return RiskLevel.SEVERE
        else:
            return RiskLevel.NO_TRAVEL

    @staticmethod
    def evaluate_snow(snow_in_hr: float) -> RiskLevel:
        """Snow: <0.5 (Low), 0.5-1.0 (Mod), 1.0-2.0 (High), 2.0-3.0 (Sev), >3.0."""
        if snow_in_hr < 0.50:
            return RiskLevel.LOW
        elif snow_in_hr <= 1.00:
            return RiskLevel.MODERATE
        elif snow_in_hr <= 2.00:
            return RiskLevel.HIGH
        elif snow_in_hr <= 3.00:
            return RiskLevel.SEVERE
        else:
            return RiskLevel.NO_TRAVEL

    @classmethod
    def evaluate_checkpoint(
        cls,
        wind_mph: float,
        rain_in_hr: float,
        snow_in_hr: float,
        load_weight_lbs: int,
    ) -> CheckpointRiskResult:
        """Evaluate composite checkpoint risk incorporating load weight rules."""
        wind_lvl = cls.evaluate_wind(wind_mph)
        rain_lvl = cls.evaluate_rain(rain_in_hr)
        snow_lvl = cls.evaluate_snow(snow_in_hr)

        hazard_levels = [wind_lvl, rain_lvl, snow_lvl]
        load_warning: Optional[str] = None

        # Load Rules Application:
        # Rule 1: >= 55 mph = No Travel
        if wind_mph >= 55.0:
            hazard_levels.append(RiskLevel.NO_TRAVEL)
            load_warning = "Wind >= 55 mph: Extreme blowover hazard. Prohibited travel."

        # Rule 2: 45-54 mph + >30,000 lb = No Travel
        elif 45.0 <= wind_mph < 55.0 and load_weight_lbs > 30000:
            hazard_levels.append(RiskLevel.NO_TRAVEL)
            load_warning = (
                f"Wind ({wind_mph:.1f} mph) with load {load_weight_lbs:,} lbs "
                "(> 30,000 lbs): Extreme tipping risk. Travel prohibited."
            )

        # Rule 3: 35-44 mph + >40,000 lb = Severe
        elif 35.0 <= wind_mph < 45.0 and load_weight_lbs > 40000:
            hazard_levels.append(RiskLevel.SEVERE)
            load_warning = (
                f"Wind ({wind_mph:.1f} mph) with load {load_weight_lbs:,} lbs " "(> 40,000 lbs): Escalated to SEVERE."
            )

        # Pick worst level among all hazards and load rules
        overall_level = max(hazard_levels, key=lambda lvl: RISK_NUMERICAL[lvl])
        score = RISK_NUMERICAL[overall_level]

        return CheckpointRiskResult(
            overall_level=overall_level,
            numerical_score=score,
            wind_level=wind_lvl,
            rain_level=rain_lvl,
            snow_level=snow_lvl,
            load_warning=load_warning,
        )
