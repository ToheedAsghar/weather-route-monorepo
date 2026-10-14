import React, { useCallback, useMemo, useRef, useState, type FormEvent } from "react";
import { format } from "date-fns";
import { ChevronRight, Loader2, MapPin, Navigation, Package, Route as RouteIcon, TriangleAlert } from "lucide-react";
import { Button } from "@/atoms/button";
import Layout from "@/layout";
import Field from "@/molecules/field";
import DepartureField from "@/molecules/departure-field";
import RouteCard from "@/molecules/route-card";
import RouteSkeleton from "@/molecules/route-skeleton";
import CheckpointCard from "@/molecules/checkpoint-card";
import ForecastSlider from "@/molecules/forecast-slider";
import { RouteMap } from "@/molecules/route-map";
import { pollRouteJob, submitRouteJob } from "@/repositories/api/route-service";
import LocationAutocomplete from "@/molecules/location-autocomplete";
import type { Checkpoint, GeoLocation, RouteOption, RouteRequest } from "@/common/types";

type PlannerState = "idle" | "loading" | "success" | "error";

export function HomePage(): React.ReactElement {
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint>();
  const [forecastHour, setForecastHour] = useState(18);
  const [departureDate, setDepartureDate] = useState<Date | null>(null);
  const [departureTime, setDepartureTime] = useState("");
  const [loadWeight, setLoadWeight] = useState("");
  const [originLocation, setOriginLocation] = useState<GeoLocation | undefined>(undefined);
  const [destinationLocation, setDestinationLocation] = useState<GeoLocation | undefined>(undefined);
  const [state, setState] = useState<PlannerState>("idle");
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | undefined>(undefined);

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
            <form onSubmit={handleSubmit} className="space-y-4">
              <LocationAutocomplete
                label="Origin"
                icon={<MapPin />}
                value={originLocation}
                onSelect={handleOriginSelect}
                required
              />
              <LocationAutocomplete
                label="Destination"
                icon={<Navigation />}
                value={destinationLocation}
                onSelect={handleDestinationSelect}
                required
              />
              <DepartureField
                date={departureDate}
                time={departureTime}
                onDate={setDepartureDate}
                onTime={setDepartureTime}
              />
              <Field icon={<Package />} label="Load weight">
                <div className="flex items-center">
                  <input
                    name="weight"
                    type="number"
                    required
                    placeholder="Enter weight in lbs (e.g. 42000)"
                    min="1"
                    value={loadWeight}
                    onChange={(e) => setLoadWeight(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-muted-foreground/50 placeholder:font-normal"
                  />
                  <span className="text-xs font-bold text-muted-foreground">lbs</span>
                </div>
              </Field>

              <Button
                type="submit"
                disabled={state === "loading"}
                className="group relative inline-flex h-12 w-full items-center justify-between gap-2 overflow-hidden rounded-full bg-primary px-5 pl-4 text-sm font-extrabold text-primary-foreground shadow-none transition-all hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 active:translate-y-px disabled:cursor-wait disabled:opacity-70"
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

            {state === "error" && (
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

        <div className="pointer-events-none absolute left-5 top-5 z-10 flex flex-col gap-2 max-md:left-3 max-md:top-3">
          <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-panel/95 px-4 py-3 shadow-card backdrop-blur-md">
            <span className="grid size-9 place-items-center rounded-md bg-primary text-background">
              <RouteIcon className="size-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground">Active corridor</p>
              <p className="mt-0.5 text-sm font-bold text-primary">
                {corridorTitle}
              </p>
            </div>
          </div>
          <div className="pointer-events-auto flex flex-wrap gap-1 rounded-md border border-border bg-panel/95 p-1.5 shadow-card backdrop-blur-md">
            {[
              ["Low", "bg-success"],
              ["Moderate", "bg-warning"],
              ["High", "bg-high"],
              ["Severe", "bg-danger"],
              ["No travel", "bg-no-travel"],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-bold">
                <i className={`size-2 rounded-full ${color}`} />
                {label}
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
