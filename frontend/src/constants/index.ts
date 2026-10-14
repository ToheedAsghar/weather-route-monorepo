import type { RiskLevel } from "@/common/types";

export const APP_CONFIG = {
  name: "WeatherRoute",
  title: "WeatherRoute | Weather-Aware Truck Routing",
  description: "Weather-aware route intelligence and risk evaluation for commercial truck dispatchers.",
} as const;

export interface RiskMeta {
  level: RiskLevel;
  label: string;
  shortLabel: string;
  color: string;
  badgeClass: string;
  textClass: string;
}

export const RISK_CONFIG: Record<RiskLevel, RiskMeta> = {
  low: {
    level: "low",
    label: "Low",
    shortLabel: "L",
    color: "#16a34a",
    badgeClass: "bg-success",
    textClass: "text-success",
  },
  moderate: {
    level: "moderate",
    label: "Moderate",
    shortLabel: "M",
    color: "#eab308",
    badgeClass: "bg-warning",
    textClass: "text-warning",
  },
  high: {
    level: "high",
    label: "High",
    shortLabel: "H",
    color: "#f97316",
    badgeClass: "bg-high",
    textClass: "text-high",
  },
  severe: {
    level: "severe",
    label: "Severe",
    shortLabel: "S",
    color: "#dc2626",
    badgeClass: "bg-danger",
    textClass: "text-danger",
  },
  "no-travel": {
    level: "no-travel",
    label: "No travel",
    shortLabel: "NT",
    color: "#171717",
    badgeClass: "bg-no-travel",
    textClass: "text-foreground",
  },
} as const;

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: RISK_CONFIG.low.color,
  moderate: RISK_CONFIG.moderate.color,
  high: RISK_CONFIG.high.color,
  severe: RISK_CONFIG.severe.color,
  "no-travel": RISK_CONFIG["no-travel"].color,
};

export const RISK_LEGEND_ITEMS: Array<{ label: string; badgeClass: string; level: RiskLevel }> = [
  { label: RISK_CONFIG.low.label, badgeClass: RISK_CONFIG.low.badgeClass, level: "low" },
  { label: RISK_CONFIG.moderate.label, badgeClass: RISK_CONFIG.moderate.badgeClass, level: "moderate" },
  { label: RISK_CONFIG.high.label, badgeClass: RISK_CONFIG.high.badgeClass, level: "high" },
  { label: RISK_CONFIG.severe.label, badgeClass: RISK_CONFIG.severe.badgeClass, level: "severe" },
  { label: RISK_CONFIG["no-travel"].label, badgeClass: RISK_CONFIG["no-travel"].badgeClass, level: "no-travel" },
];

export const GEOCODING_CONFIG = {
  MIN_QUERY_LENGTH: 3,
  DEBOUNCE_MS: 300,
} as const;

export const API_CONFIG = {
  ENDPOINTS: {
    ROUTE: "/api/route/",
    AUTOCOMPLETE: "/api/geocode/autocomplete/",
  },
  POLLING: {
    INTERVAL_MS: 2000,
    MAX_ATTEMPTS: 60,
  },
  HEALTH_CHECK_INTERVAL_MS: 5000,
  DEFAULT_CHECKPOINT_INTERVAL_MILES: 25,
} as const;

export const PLANNER_DEFAULTS = {
  FORECAST_HOUR: 18,
} as const;

export const MAP_CONFIG = {
  SOURCES: {
    ROUTES: "weather-routes",
    CHECKPOINTS: "route-checkpoints",
    WEATHER: "weather-corridor",
  },
  STYLE_URL: "mapbox://styles/mapbox/light-v11",
  DEFAULT_CENTER: [20, 20] as [number, number],
  DEFAULT_ZOOM: 2,
  FOCUSED_ZOOM: 10,
  BOUNDS_PADDING: 70,
} as const;
