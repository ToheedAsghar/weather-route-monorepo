import "mapbox-gl/dist/mapbox-gl.css";

import { memo, useEffect, useRef } from "react";
import type { FeatureCollection, LineString, Point } from "geojson";

import type { Checkpoint, GeoLocation, RouteOption } from "@/common/types";
import { RISK_COLORS } from "@/common/types";

interface RouteMapProps {
  origin?: GeoLocation;
  destination?: GeoLocation;
  routes: RouteOption[];
  selectedRouteId: string;
  selectedCheckpointId: string | undefined;
  forecastHour: number;
  onCheckpointSelect: (checkpoint: Checkpoint) => void;
}

const ROUTES_SOURCE = "weather-routes";
const CHECKPOINTS_SOURCE = "route-checkpoints";
const WEATHER_SOURCE = "weather-corridor";

function RouteMapComponent({
  origin,
  destination,
  routes,
  selectedRouteId,
  selectedCheckpointId,
  forecastHour,
  onCheckpointSelect,
}: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("mapbox-gl").Map | undefined>(undefined);
  const originMarkerRef = useRef<import("mapbox-gl").Marker | undefined>(undefined);
  const destMarkerRef = useRef<import("mapbox-gl").Marker | undefined>(undefined);

  const routesRef = useRef(routes);
  const callbackRef = useRef(onCheckpointSelect);
  const frameRef = useRef<number | undefined>(undefined);

  routesRef.current = routes;
  callbackRef.current = onCheckpointSelect;

  // Initialize Mapbox map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;

    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (disposed || !containerRef.current) return;
      const token = (import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN) as string | undefined;
      if (!token) return;
      mapboxgl.accessToken = token;

      // Mapbox requires RGB colors; resolve shared tokens from document theme
      const theme = getComputedStyle(document.documentElement);
      const swatch = document.createElement("canvas").getContext("2d");
      const themeColor = (name: string, fallback: string) => {
        if (!swatch) return fallback;
        swatch.clearRect(0, 0, 1, 1);
        swatch.fillStyle = theme.getPropertyValue(name).trim() || fallback;
        swatch.fillRect(0, 0, 1, 1);
        const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
      };

      const panelColor = themeColor("--panel", "#ffffff");
      const inkColor = themeColor("--primary", "#111827");
      const brassColor = themeColor("--brass", "#f59e0b");

      const initialCenter: [number, number] = origin ? [origin.lon, origin.lat] : [20, 20];
      const initialZoom = origin ? 10 : 2;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: initialCenter,
        zoom: initialZoom,
        attributionControl: false,
      });

      mapRef.current = map;

      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(containerRef.current);
      map.once("remove", () => resizeObserver.disconnect());

      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        // 1. Weather corridor glow
        map.addSource(WEATHER_SOURCE, {
          type: "geojson",
          data: weatherGeoJson(routesRef.current, selectedRouteId, forecastHour),
        });
        map.addLayer({
          id: "weather-corridor-glow",
          type: "line",
          source: WEATHER_SOURCE,
          paint: {
            "line-color": [
              "interpolate",
              ["linear"],
              ["get", "intensity"],
              0,
              RISK_COLORS.low,
              0.45,
              RISK_COLORS.moderate,
              0.72,
              RISK_COLORS.high,
              1,
              RISK_COLORS.severe,
            ],
            "line-opacity": ["interpolate", ["linear"], ["get", "intensity"], 0, 0.05, 1, 0.28],
            "line-width": ["interpolate", ["linear"], ["get", "intensity"], 0, 18, 1, 42],
            "line-blur": 14,
          },
        });

        // 2. Route polylines
        map.addSource(ROUTES_SOURCE, {
          type: "geojson",
          data: routesGeoJson(routesRef.current, selectedRouteId),
        });
        map.addLayer({
          id: "route-casing",
          type: "line",
          source: ROUTES_SOURCE,
          paint: {
            "line-color": panelColor,
            "line-width": ["case", ["get", "selected"], 9, 6],
            "line-opacity": 0.96,
          },
        });
        map.addLayer({
          id: "route-segments",
          type: "line",
          source: ROUTES_SOURCE,
          paint: {
            "line-color": [
              "match",
              ["get", "risk"],
              "low",
              RISK_COLORS.low,
              "moderate",
              RISK_COLORS.moderate,
              "high",
              RISK_COLORS.high,
              "severe",
              RISK_COLORS.severe,
              RISK_COLORS["no-travel"],
            ],
            "line-width": ["case", ["get", "selected"], 6, 3],
            "line-opacity": ["case", ["get", "selected"], 1, 0.52],
          },
        });

        // 3. Interactive Checkpoint nodes
        map.addSource(CHECKPOINTS_SOURCE, {
          type: "geojson",
          data: checkpointsGeoJson(routesRef.current, selectedRouteId, selectedCheckpointId),
        });
        map.addLayer({
          id: "checkpoint-shadow",
          type: "circle",
          source: CHECKPOINTS_SOURCE,
          paint: { "circle-radius": 15, "circle-color": inkColor, "circle-opacity": 0.1, "circle-blur": 0.7 },
        });
        map.addLayer({
          id: "checkpoint-node",
          type: "circle",
          source: CHECKPOINTS_SOURCE,
          paint: {
            "circle-radius": ["case", ["get", "selected"], 11, 9],
            "circle-color": panelColor,
            "circle-stroke-color": ["case", ["get", "selected"], brassColor, inkColor],
            "circle-stroke-width": ["case", ["get", "selected"], 4, 3],
          },
        });
        map.addLayer({
          id: "checkpoint-center",
          type: "circle",
          source: CHECKPOINTS_SOURCE,
          paint: {
            "circle-radius": 3,
            "circle-color": [
              "match",
              ["get", "risk"],
              "low",
              RISK_COLORS.low,
              "moderate",
              RISK_COLORS.moderate,
              "high",
              RISK_COLORS.high,
              "severe",
              RISK_COLORS.severe,
              RISK_COLORS["no-travel"],
            ],
          },
        });

        map.on("mouseenter", "checkpoint-node", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "checkpoint-node", () => {
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "checkpoint-node", (event) => {
          const id = event.features?.[0]?.properties?.["checkpointId"] as string | undefined;
          const cp = routesRef.current.flatMap((r) => r.checkpoints).find((item) => item.id === id);
          if (cp) callbackRef.current(cp);
        });

        // If routes already exist when style finishes loading, fit viewport bounds immediately
        const readyRoute = routesRef.current.find((r) => r.id === selectedRouteId) || routesRef.current[0];
        if (readyRoute && readyRoute.segments.length > 0) {
          const allCoords = readyRoute.segments.flatMap((s) => s.coordinates);
          if (allCoords.length > 1) {
            const bounds = new mapboxgl.LngLatBounds(allCoords[0], allCoords[0]);
            for (const pt of allCoords) {
              bounds.extend(pt as [number, number]);
            }
            map.fitBounds(bounds, { padding: 70, duration: 1200, maxZoom: 11 });
          }
        }
      });
    });

    return () => {
      disposed = true;
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      originMarkerRef.current?.remove();
      destMarkerRef.current?.remove();
      originMarkerRef.current = undefined;
      destMarkerRef.current = undefined;
      mapRef.current?.remove();
      mapRef.current = undefined;
    };
  }, []);

  // Sync Origin and Destination markers and auto-pan/fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      // 1. Origin Marker
      if (origin) {
        if (!originMarkerRef.current) {
          const el = document.createElement("div");
          el.className = "origin-map-pin";
          el.innerHTML = `
            <div style="display:flex;align-items:center;gap:4px;background:#10b981;color:#ffffff;padding:4px 9px;border-radius:9999px;font-size:11px;font-weight:800;border:2px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.35);cursor:pointer;white-space:nowrap;">
              <span>Origin</span>
            </div>
            <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #10b981;margin:0 auto;"></div>
          `;
          const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([origin.lon, origin.lat])
            .setPopup(new mapboxgl.Popup({ offset: 15, closeButton: false }).setText(origin.address))
            .addTo(map);
          originMarkerRef.current = marker;
        } else {
          originMarkerRef.current.setLngLat([origin.lon, origin.lat]);
          originMarkerRef.current.getPopup()?.setText(origin.address);
        }
      } else if (originMarkerRef.current) {
        originMarkerRef.current.remove();
        originMarkerRef.current = undefined;
      }

      // 2. Destination Marker
      if (destination) {
        if (!destMarkerRef.current) {
          const el = document.createElement("div");
          el.className = "destination-map-pin";
          el.innerHTML = `
            <div style="display:flex;align-items:center;gap:4px;background:#ef4444;color:#ffffff;padding:4px 9px;border-radius:9999px;font-size:11px;font-weight:800;border:2px solid #ffffff;box-shadow:0 4px 14px rgba(0,0,0,0.35);cursor:pointer;white-space:nowrap;">
              <span>Destination</span>
            </div>
            <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #ef4444;margin:0 auto;"></div>
          `;
          const marker = new mapboxgl.Marker({ element: el, anchor: "bottom" })
            .setLngLat([destination.lon, destination.lat])
            .setPopup(new mapboxgl.Popup({ offset: 15, closeButton: false }).setText(destination.address))
            .addTo(map);
          destMarkerRef.current = marker;
        } else {
          destMarkerRef.current.setLngLat([destination.lon, destination.lat]);
          destMarkerRef.current.getPopup()?.setText(destination.address);
        }
      } else if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = undefined;
      }

      // 3. Move camera when no route is calculated yet
      if (routes.length === 0) {
        if (origin && destination) {
          const bounds = new mapboxgl.LngLatBounds(
            [Math.min(origin.lon, destination.lon), Math.min(origin.lat, destination.lat)],
            [Math.max(origin.lon, destination.lon), Math.max(origin.lat, destination.lat)]
          );
          map.fitBounds(bounds, { padding: 90, maxZoom: 12, duration: 1400 });
        } else if (origin) {
          map.flyTo({ center: [origin.lon, origin.lat], zoom: 10, duration: 1200 });
        } else if (destination) {
          map.flyTo({ center: [destination.lon, destination.lat], zoom: 10, duration: 1200 });
        }
      }
    });
  }, [origin, destination, routes.length]);

  // Sync Routes and Checkpoints onto Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    (map.getSource(ROUTES_SOURCE) as import("mapbox-gl").GeoJSONSource | undefined)?.setData(
      routesGeoJson(routes, selectedRouteId)
    );
    (map.getSource(CHECKPOINTS_SOURCE) as import("mapbox-gl").GeoJSONSource | undefined)?.setData(
      checkpointsGeoJson(routes, selectedRouteId, selectedCheckpointId)
    );

    const active = routes.find((r) => r.id === selectedRouteId) || routes[0];
    if (active && active.segments.length > 0) {
      const allCoords = active.segments.flatMap((s) => s.coordinates);
      if (allCoords.length > 1) {
        void import("mapbox-gl").then(({ default: mapboxgl }) => {
          const bounds = new mapboxgl.LngLatBounds(allCoords[0], allCoords[0]);
          for (const pt of allCoords) {
            bounds.extend(pt as [number, number]);
          }
          map.fitBounds(bounds, { padding: 70, duration: 1200, maxZoom: 11 });
        });
      }
    }
  }, [routes, selectedRouteId, selectedCheckpointId]);

  // Sync Forecast Timeline Glow
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      (map.getSource(WEATHER_SOURCE) as import("mapbox-gl").GeoJSONSource | undefined)?.setData(
        weatherGeoJson(routes, selectedRouteId, forecastHour)
      );
    });
  }, [forecastHour, routes, selectedRouteId]);

  const hasToken = Boolean(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_TOKEN);
  return (
    <div className="absolute inset-0 bg-map" aria-label="Route risk map">
      <div ref={containerRef} className="h-full w-full" />
      {!hasToken && (
        <div className="absolute inset-0 grid place-items-center bg-map text-sm font-semibold text-muted-foreground">
          Map connection required
        </div>
      )}
    </div>
  );
}

export const RouteMap = memo(RouteMapComponent);

function routesGeoJson(routes: RouteOption[], selectedRouteId: string): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: routes.flatMap((route) =>
      route.segments.map((segment) => ({
        type: "Feature" as const,
        properties: { risk: segment.risk, selected: route.id === selectedRouteId },
        geometry: { type: "LineString" as const, coordinates: segment.coordinates },
      }))
    ),
  };
}

function checkpointsGeoJson(
  routes: RouteOption[],
  selectedRouteId: string,
  selectedCheckpointId?: string
): FeatureCollection<Point> {
  const route = routes.find((item) => item.id === selectedRouteId);
  return {
    type: "FeatureCollection",
    features: (route?.checkpoints ?? []).map((checkpoint) => ({
      type: "Feature",
      properties: {
        checkpointId: checkpoint.id,
        risk: checkpoint.risk,
        selected: checkpoint.id === selectedCheckpointId,
      },
      geometry: { type: "Point", coordinates: checkpoint.coordinate },
    })),
  };
}

function weatherGeoJson(routes: RouteOption[], selectedRouteId: string, hour: number): FeatureCollection<LineString> {
  const route = routes.find((item) => item.id === selectedRouteId);
  const averageIntensity =
    route?.checkpoints.reduce((sum, checkpoint) => {
      const closest = checkpoint.weather.reduce((previous, current) =>
        Math.abs(current.hour - hour) < Math.abs(previous.hour - hour) ? current : previous
      );
      return sum + closest.intensity;
    }, 0) ?? 0;
  const intensity = route?.checkpoints.length ? averageIntensity / route.checkpoints.length : 0;
  return {
    type: "FeatureCollection",
    features: (route?.segments ?? []).map((segment) => ({
      type: "Feature",
      properties: { intensity },
      geometry: { type: "LineString", coordinates: segment.coordinates },
    })),
  };
}