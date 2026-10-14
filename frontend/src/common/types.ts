export type RiskLevel = "low" | "moderate" | "high" | "severe" | "no-travel";

export type Coordinate = [longitude: number, latitude: number];

export interface GeoLocation {
  lat: number;
  lon: number;
  address: string;
}

export interface LocationSuggestion {
  id: string;
  place_name: string;
  text: string;
  lat: number;
  lon: number;
}

export interface RouteRequest {
  origin: string | GeoLocation;
  destination: string | GeoLocation;
  departure_datetime: string;
  load_weight_lbs: number;
}

export interface WeatherSnapshot {
  hour: number;
  windMph: number;
  rainIn: number;
  snowIn: number;
  intensity: number;
}

export interface Checkpoint {
  id: string;
  name: string;
  coordinate: Coordinate;
  eta: string;
  risk: RiskLevel;
  weather: WeatherSnapshot[];
}

export interface RouteSegment {
  id: string;
  risk: RiskLevel;
  coordinates: Coordinate[];
}

export interface RouteOption {
  id: string;
  name: string;
  description: string;
  distanceMiles: number;
  durationMinutes: number;
  severeMiles: number;
  highMiles: number;
  recommended: boolean;
  segments: RouteSegment[];
  checkpoints: Checkpoint[];
}

export interface CompletedRouteJob {
  status: "complete";
  job_id: string;
  routes: RouteOption[];
}

export type RouteJobResponse =
  | { status: "queued" | "processing"; job_id: string; progress?: number }
  | CompletedRouteJob
  | { status: "failed"; job_id: string; message: string };

export { RISK_COLORS } from "@/constants";