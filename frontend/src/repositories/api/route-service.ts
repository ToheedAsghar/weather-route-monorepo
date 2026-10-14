import type { CompletedRouteJob, Coordinate, GeoLocation, LocationSuggestion, RiskLevel, RouteJobResponse, RouteOption, RouteRequest, RouteSegment, Checkpoint, WeatherSnapshot } from "@/common/types";

const RAW_API_URL = (import.meta.env["VITE_API_URL"] as string | undefined)?.replace(/\/$/, "");
const API_BASE = RAW_API_URL ? RAW_API_URL.replace(/\/api$/, "") : "";
const ROUTE_URL = API_BASE ? `${API_BASE}/api/route/` : "/api/route/";
const POLL_URL = (id: string) => (API_BASE ? `${API_BASE}/api/route/${encodeURIComponent(id)}/` : `/api/route/${encodeURIComponent(id)}/`);
const AUTOCOMPLETE_URL = API_BASE ? `${API_BASE}/api/geocode/autocomplete/` : "/api/geocode/autocomplete/";

export async function searchLocations(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  const clean = query.trim();
  if (clean.length < 3) return [];

  // 1. Query backend endpoint with Redis caching & IP rate limit
  try {
    const url = `${AUTOCOMPLETE_URL}?q=${encodeURIComponent(clean)}`;
    const response = await fetch(url, { signal: signal ?? null });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    console.warn("Backend geocode lookup failed; trying client fallback.", error);
  }

  // 2. Client-side fallback if backend is offline
  const token = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN) as string | undefined;
  if (token) {
    try {
      const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(clean)}.json?access_token=${token}&autocomplete=true&limit=6`;
      const res = await fetch(mapboxUrl, { signal: signal ?? null });
      if (res.ok) {
        const geo = await res.json();
        return (geo.features || [])
          .filter((f: any) => Array.isArray(f.center) && f.center.length >= 2)
          .map((f: any) => ({
            id: f.id,
            place_name: f.place_name,
            text: f.text,
            lat: f.center[1],
            lon: f.center[0],
          }));
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
    }
  }

  return [];
}

const wait = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Request cancelled", "AbortError"));
      },
      { once: true }
    );
  });

export async function submitRouteJob(request: RouteRequest, signal?: AbortSignal): Promise<{ job_id: string }> {
  let originCoord: GeoLocation;
  if (typeof request.origin === "object" && request.origin !== null) {
    originCoord = request.origin;
  } else if (typeof request.origin === "string" && request.origin.trim().length >= 3) {
    const suggestions = await searchLocations(request.origin, signal);
    if (!suggestions[0]) {
      throw new Error(`Unable to resolve coordinates for Origin: "${request.origin}". Please select a location from the dropdown suggestions.`);
    }
    originCoord = { lat: suggestions[0].lat, lon: suggestions[0].lon, address: suggestions[0].place_name };
  } else {
    throw new Error("Please specify an origin location.");
  }

  let destCoord: GeoLocation;
  if (typeof request.destination === "object" && request.destination !== null) {
    destCoord = request.destination;
  } else if (typeof request.destination === "string" && request.destination.trim().length >= 3) {
    const suggestions = await searchLocations(request.destination, signal);
    if (!suggestions[0]) {
      throw new Error(`Unable to resolve coordinates for Destination: "${request.destination}". Please select a location from the dropdown suggestions.`);
    }
    destCoord = { lat: suggestions[0].lat, lon: suggestions[0].lon, address: suggestions[0].place_name };
  } else {
    throw new Error("Please specify a destination location.");
  }

  const departureIso = request.departure_datetime.includes("T")
    ? (request.departure_datetime.endsWith("Z") ? request.departure_datetime : `${request.departure_datetime}:00Z`)
    : `${request.departure_datetime}T00:00:00Z`;

  const payload = {
    origin: originCoord,
    destination: destCoord,
    departure_time: departureIso,
    load_weight_lbs: request.load_weight_lbs || 42000,
    checkpoint_interval_miles: 25,
  };

  const response = await fetch(ROUTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: signal ?? null,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = `Server returned HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(errorText);
      msg = errJson.detail || errJson.error_message || errJson.error || JSON.stringify(errJson);
    } catch {
      if (errorText) msg = errorText;
    }
    throw new Error(msg);
  }

  const data = await response.json();
  if (!data.job_id) {
    throw new Error("Invalid response from server: job_id is missing");
  }

  return { job_id: data.job_id };
}

export async function getRouteJob(jobId: string, attempt: number, signal?: AbortSignal): Promise<RouteJobResponse> {
  const response = await fetch(POLL_URL(jobId), { signal: signal ?? null });
  if (!response.ok) {
    throw new Error(`Failed to check route job status (HTTP ${response.status})`);
  }

  const data = await response.json();
  const statusUpper = (data.status || "").toUpperCase();

  if (statusUpper === "PENDING" || statusUpper === "PROCESSING") {
    return {
      status: statusUpper === "PENDING" ? "queued" : "processing",
      job_id: jobId,
      progress: Math.min(95, 20 + attempt * 20),
    };
  }

  if (statusUpper === "COMPLETED" || statusUpper === "SUCCESS") {
    const ranked = data.result?.ranked_routes || [];
    if (ranked.length === 0) {
      throw new Error("No navigable corridors found between the selected origin and destination.");
    }

    const routes: RouteOption[] = ranked.map((r: any, idx: number) => {
      const checkpoints: Checkpoint[] = (r.checkpoints || []).map((cp: any, cIdx: number) => {
        const cpRisk = (cp.risk?.overall_level || "low").toLowerCase().replace("_", "-") as RiskLevel;
        const baseWind = Number(cp.weather?.wind_speed_mph ?? 10);
        const baseRain = Number((cp.weather?.rain_intensity_in_hr ?? 0).toFixed(2));
        const baseSnow = Number((cp.weather?.snow_intensity_in_hr ?? 0).toFixed(1));
        const baseScore = Number(((cp.risk?.numerical_score ?? 1) / 100).toFixed(2));

        // Create timeline weather snapshots (0 to 48 hours) for interactive forecasting
        const weatherSnapshots: WeatherSnapshot[] = Array.from({ length: 9 }, (_, i) => {
          const hour = i * 6;
          const decay = Math.max(0.6, 1 - Math.abs(hour - 18) / 60);
          return {
            hour,
            windMph: Math.round(baseWind * decay),
            rainIn: Number((baseRain * decay).toFixed(2)),
            snowIn: Number((baseSnow * decay).toFixed(1)),
            intensity: Number((baseScore * decay).toFixed(2)),
          };
        });

        return {
          id: `cp-${idx}-${cp.sequence ?? cIdx}`,
          name: `Mile ${Math.round(cp.distance_from_origin_miles ?? cIdx * 25)}`,
          coordinate: [Number(cp.coordinates?.lon ?? 0), Number(cp.coordinates?.lat ?? 0)] as Coordinate,
          eta: cp.eta ? cp.eta.slice(11, 16) : `+${cIdx}h`,
          risk: cpRisk,
          weather: weatherSnapshots,
        };
      });

      const segments: RouteSegment[] = [];
      for (let i = 0; i < checkpoints.length - 1; i++) {
        segments.push({
          id: `seg-${idx}-${i}`,
          risk: checkpoints[i].risk,
          coordinates: [checkpoints[i].coordinate, checkpoints[i + 1].coordinate],
        });
      }

      const totalDist = Math.round(r.total_distance_miles ?? 0);
      const totalDurMin = Math.round((r.total_duration_hours ?? 0) * 60);

      return {
        id: r.route_id || `route-${idx}`,
        name: r.route_summary || `Route Option ${idx + 1}`,
        description: r.is_travel_recommended ? "Clear corridors / minimal weather hazard" : "Weather advisories along corridor",
        distanceMiles: totalDist,
        durationMinutes: totalDurMin,
        severeMiles: Math.round(r.risk_breakdown?.severe_miles ?? 0),
        highMiles: Math.round(r.risk_breakdown?.high_miles ?? 0),
        recommended: r.is_travel_recommended ?? idx === 0,
        segments,
        checkpoints,
      };
    });

    return { status: "complete", job_id: jobId, routes };
  }

  if (statusUpper === "FAILED") {
    return { status: "failed", job_id: jobId, message: data.error_message || "Route evaluation failed" };
  }

  return { status: "processing", job_id: jobId, progress: 50 };
}

export async function pollRouteJob(jobId: string, signal?: AbortSignal): Promise<CompletedRouteJob> {
  const maximumAttempts = 60;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const result = await getRouteJob(jobId, attempt, signal);
    if (result.status === "complete") return result;
    if (result.status === "failed") throw new Error(result.message || "Route planning failed");
    await wait(2_000, signal);
  }
  throw new Error("Route planning timed out. Please try again.");
}