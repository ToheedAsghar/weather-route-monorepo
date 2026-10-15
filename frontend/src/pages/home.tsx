import React, { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ChevronRight, Loader2, MapPin, Navigation, Package, RefreshCw, Route as RouteIcon, TriangleAlert } from "lucide-react";
import { Button } from "@/atoms/button";
import Layout from "@/layout";
import Field from "@/molecules/field";
import DepartureField from "@/molecules/departure-field";
import RouteCard from "@/molecules/route-card";
import RouteSkeleton from "@/molecules/route-skeleton";
import CheckpointCard from "@/molecules/checkpoint-card";
import ForecastSlider from "@/molecules/forecast-slider";
import { RouteMap } from "@/molecules/route-map";
import { checkRoutingEngineHealth, pollRouteJob, RoutingEngineOfflineError, submitRouteJob } from "@/repositories/api/route-service";
import LocationAutocomplete from "@/molecules/location-autocomplete";
import { API_CONFIG, PLANNER_DEFAULTS, RISK_LEGEND_ITEMS } from "@/constants";
import type { Checkpoint, GeoLocation, RouteOption, RouteRequest } from "@/common/types";

type PlannerState = "idle" | "loading" | "success" | "error";

export function HomePage(): React.ReactElement {
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint>();
  const [forecastHour, setForecastHour] = useState<number>(PLANNER_DEFAULTS.FORECAST_HOUR);
  const [departureDate, setDepartureDate] = useState<Date | null>(null);
  const [departureTime, setDepartureTime] = useState("");
  const [loadWeight, setLoadWeight] = useState("");
  const [originLocation, setOriginLocation] = useState<GeoLocation | undefined>(undefined);
  const [destinationLocation, setDestinationLocation] = useState<GeoLocation | undefined>(undefined);
  const [state, setState] = useState<PlannerState>("idle");
  const [error, setError] = useState("");
  const [isSystemOffline, setIsSystemOffline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const abortRef = useRef<AbortController | undefined>(undefined);

  const handleSystemOffline = useCallback(() => {
    setIsSystemOffline(true);
  }, []);

  const handleRetryConnection = useCallback(async () => {
    setIsRetrying(true);
    try {
      const healthy = await checkRoutingEngineHealth();
      if (healthy) {
        setIsSystemOffline(false);
        setError("");
        setState("idle");
      }
    } finally {
      setIsRetrying(false);
    }
  }, []);

  // Check health on initial mount
  useEffect(() => {
    let mounted = true;
    checkRoutingEngineHealth().then((healthy) => {
      if (mounted && !healthy) {
        setIsSystemOffline(true);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Automatically reconnect once backend is back online
  useEffect(() => {
    if (!isSystemOffline) return;
    const interval = window.setInterval(async () => {
      const healthy = await checkRoutingEngineHealth();
      if (healthy) {
        setIsSystemOffline(false);
        setError("");
        setState("idle");
      }
    }, API_CONFIG.HEALTH_CHECK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [isSystemOffline]);

  const departure = useMemo(() => {
    if (!departureDate || !departureTime) return "";
    return `${format(departureDate, "yyyy-MM-dd")}T${departureTime}`;
  }, [departureDate, departureTime]);

  const handleOriginSelect = useCallback((location: GeoLocation | undefined) => {
    setOriginLocation(location);
    setRoutes([]);
    setSelectedRouteId("");
    setSelectedCheckpoint(undefined);
    setState("idle");
    setError("");
  }, []);

  const handleDestinationSelect = useCallback((location: GeoLocation | undefined) => {
    setDestinationLocation(location);
    setRoutes([]);
    setSelectedRouteId("");
    setSelectedCheckpoint(undefined);
    setState("idle");
    setError("");
  }, []);

  const planRoute = useCallback(async (request: RouteRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState("loading");
    setError("");
    setSelectedCheckpoint(undefined);
    try {
      const job = await submitRouteJob(request, controller.signal);
      const result = await pollRouteJob(job.job_id, controller.signal);
      setRoutes(result.routes);
      setSelectedRouteId(
        result.routes.find((route) => route.recommended)?.id ?? result.routes[0]?.id ?? ""
      );
      setState("success");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      if (caught instanceof RoutingEngineOfflineError) {
        setIsSystemOffline(true);
      }
      setError(caught instanceof Error ? caught.message : "Unable to evaluate route");
      setState("error");
    }
  }, []);

  const activeRoute = routes.find((route) => route.id === selectedRouteId);
  const snapshot = useMemo(
    () =>
      selectedCheckpoint?.weather.reduce((previous, current) =>
        Math.abs(current.hour - forecastHour) < Math.abs(previous.hour - forecastHour)
          ? current
          : previous
      ),
    [forecastHour, selectedCheckpoint]
  );
  const onCheckpointSelect = useCallback((checkpoint: Checkpoint) => setSelectedCheckpoint(checkpoint), []);

  const forecastTimeLabel = useMemo(() => {
    if (!departure) return forecastHour === 0 ? "Now" : `+${forecastHour} hours`;
    const base = new Date(departure);
    if (Number.isNaN(base.getTime())) return forecastHour === 0 ? "Now" : `+${forecastHour} hours`;
    const computed = new Date(base.getTime() + forecastHour * 60 * 60 * 1000);
    return format(computed, "EEE, d MMM · h:mm a");
  }, [departure, forecastHour]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!originLocation) {
      setError("Please search and select an origin location.");
      setState("error");
      return;
    }
    if (!destinationLocation) {
      setError("Please search and select a destination location.");
      setState("error");
      return;
    }
    if (!departureDate || !departureTime) {
      setError("Please select a departure date and time.");
      setState("error");
      return;
    }
    const weightNum = Number(loadWeight);
    if (!loadWeight.trim() || isNaN(weightNum) || weightNum <= 0) {
      setError("Please enter a valid load weight in lbs.");
      setState("error");
      return;
    }

    void planRoute({
      origin: originLocation,
      destination: destinationLocation,
      departure_datetime: departure,
      load_weight_lbs: weightNum,
    });
  }

  const corridorTitle = useMemo(() => {
    if (activeRoute) return activeRoute.name;
    if (originLocation && destinationLocation) {
      const from = originLocation.address.split(",")[0];
      const to = destinationLocation.address.split(",")[0];
      return `${from} → ${to}`;
    }
    if (originLocation) {
      return `From ${originLocation.address.split(",")[0]}`;
    }
    return "Awaiting locations";
  }, [activeRoute, destinationLocation, originLocation]);

  return (
    <Layout>
      <aside className="relative z-20 flex w-[380px] shrink-0 flex-col border-r border-border bg-panel max-lg:w-[330px] max-md:w-full max-md:border-r-0 max-md:border-b">
        <div className="overflow-y-auto px-5 py-6 max-md:overflow-visible">
          <section>
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-xl font-bold text-primary">Plan your route</h2>
              </div>
              <RouteIcon className="size-5 text-primary" />
            </div>
            {isSystemOffline && (
              <div
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-input-surface px-3.5 py-2.5 shadow-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-75" />
                    <span className="relative inline-flex size-2 rounded-full bg-danger" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold leading-tight text-primary">System offline</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {isRetrying ? "Connecting to backend…" : "Backend unreachable"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRetryConnection}
                  disabled={isRetrying}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1 text-[11px] font-bold text-primary shadow-xs transition hover:border-border-strong hover:bg-background active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw className={`size-3 text-muted-foreground ${isRetrying ? "animate-spin text-primary" : ""}`} />
                  <span>{isRetrying ? "Checking…" : "Retry"}</span>
                </button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <LocationAutocomplete
                label="Origin"
                icon={<MapPin />}
                value={originLocation}
                onSelect={handleOriginSelect}
                disabled={isSystemOffline}
                onOffline={handleSystemOffline}
                required
              />
              <LocationAutocomplete
                label="Destination"
                icon={<Navigation />}
                value={destinationLocation}
                onSelect={handleDestinationSelect}
                disabled={isSystemOffline}
                onOffline={handleSystemOffline}
                required
              />
              <DepartureField
                date={departureDate}
                time={departureTime}
                onDate={setDepartureDate}
                onTime={setDepartureTime}
                disabled={isSystemOffline}
              />
              <Field icon={<Package />} label="Load weight" disabled={isSystemOffline}>
                <div className="flex items-center">
                  <input
                    name="weight"
                    type="number"
                    required
                    disabled={isSystemOffline}
                    placeholder="Enter weight in lbs (e.g. 42000)"
                    min="1"
                    value={loadWeight}
                    onChange={(e) => setLoadWeight(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-muted-foreground/50 placeholder:font-normal disabled:cursor-not-allowed"
                  />
                  <span className="text-xs font-bold text-muted-foreground">lbs</span>
                </div>
              </Field>

              <Button
                type="submit"
                disabled={isSystemOffline || state === "loading"}
                className="group relative inline-flex h-12 w-full items-center justify-between gap-2 overflow-hidden rounded-full bg-primary px-5 pl-4 text-sm font-extrabold text-primary-foreground shadow-none transition-all hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center gap-2.5">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-background/15 text-background transition-colors group-hover:bg-background/25">
                    {state === "loading" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RouteIcon className="size-3.5" />
                    )}
                  </span>
                  <span className="tracking-tight">
                    {state === "loading" ? "Analyzing weather…" : "Calculate routes"}
                  </span>
                </span>
                {state !== "loading" && (
                  <ChevronRight
                    className="size-4 text-background transition-transform duration-200 group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                )}
              </Button>
            </form>
          </section>

          <div className="my-6 h-px bg-border" />
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="section-label">Route comparison</p>
                <h2 className="mt-1 text-base font-bold text-primary">
                  Available routes{" "}
                  <span className="ml-1 text-xs font-medium text-muted-foreground">
                    / {routes.length}
                  </span>
                </h2>
              </div>
              {state === "success" && (
                <span className="rounded-sm bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">
                  Updated now
                </span>
              )}
            </div>

            {state === "idle" && (
              <div className="rounded-xl border border-dashed border-border p-5 text-center">
                <RouteIcon className="mx-auto size-7 text-muted-foreground/60" />
                <p className="mt-2 text-xs font-bold text-primary">No route calculated yet</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Select your origin, destination, schedule and load weight above, then click Calculate routes to evaluate weather risks along your corridor.
                </p>
              </div>
            )}

            {state === "loading" && <RouteSkeleton />}

            {state === "error" && !isSystemOffline && (
              <div className="rounded-md border border-danger/20 bg-danger-soft p-4">
                <div className="flex gap-2 text-sm font-bold text-danger">
                  <TriangleAlert className="size-4 shrink-0" /> Route unavailable
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{error}</p>
              </div>
            )}

            {state === "success" && (
              <div className="space-y-2">
                {routes.map((route) => (
                  <RouteCard
                    key={route.id}
                    route={route}
                    active={route.id === selectedRouteId}
                    onClick={() => {
                      setSelectedRouteId(route.id);
                      setSelectedCheckpoint(undefined);
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>

      <section className="relative h-full min-w-0 flex-1 overflow-hidden bg-map max-md:h-[620px] max-md:min-h-[620px] max-md:flex-none">
        <RouteMap
          origin={originLocation}
          destination={destinationLocation}
          routes={routes}
          selectedRouteId={selectedRouteId}
          selectedCheckpointId={selectedCheckpoint?.id}
          forecastHour={forecastHour}
          onCheckpointSelect={onCheckpointSelect}
        />

        <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-1.5 max-md:left-3 max-md:top-3">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-border bg-background/95 px-3 py-2 shadow-card backdrop-blur-md">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-background">
              <RouteIcon className="size-3.5" />
            </span>
            <div>
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Active corridor</p>
              <p className="text-xs font-extrabold text-primary">
                {corridorTitle}
              </p>
            </div>
          </div>
          <div className="pointer-events-auto flex flex-wrap gap-1 rounded-lg border border-border bg-background/95 px-2 py-1 shadow-card backdrop-blur-md">
            {RISK_LEGEND_ITEMS.map((item) => (
              <span key={item.level} className="flex items-center gap-1 px-1 py-0.5 text-[9px] font-bold text-foreground">
                <i className={`size-1.5 shrink-0 rounded-full ${item.badgeClass}`} />
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {selectedCheckpoint && snapshot && (
          <CheckpointCard
            checkpoint={selectedCheckpoint}
            snapshot={snapshot}
            onClose={() => setSelectedCheckpoint(undefined)}
          />
        )}

        {routes.length > 0 && Boolean(activeRoute) && (
          <ForecastSlider
            forecastHour={forecastHour}
            forecastTimeLabel={forecastTimeLabel}
            onForecastChange={setForecastHour}
          />
        )}
      </section>
    </Layout>
  );
}

export default HomePage;
