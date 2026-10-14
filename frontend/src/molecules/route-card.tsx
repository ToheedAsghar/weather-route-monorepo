import React from "react";
import { Check } from "lucide-react";
import { Button } from "@/atoms/button";
import type { RouteOption } from "@/common/types";

interface RouteCardProps {
  route: RouteOption;
  active: boolean;
  onClick: () => void;
}

export function RouteCard({ route, active, onClick }: RouteCardProps): React.ReactElement {
  const hours = Math.floor(route.durationMinutes / 60);
  const minutes = route.durationMinutes % 60;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      aria-pressed={active}
      className={`relative block h-auto w-full whitespace-normal rounded-xl border p-3.5 text-left transition ${
        active
          ? "border-primary bg-background shadow-card hover:bg-background"
          : "border-border bg-panel hover:border-border-strong hover:bg-background"
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span
          className={`flex items-center gap-1.5 text-[9px] font-bold uppercase ${
            route.recommended ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {route.recommended ? (
            <>
              <Check className="size-3" /> Recommended
            </>
          ) : (
            "Alternative route"
          )}
        </span>
        <span
          className={`grid size-4 place-items-center rounded-full border ${
            active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-input"
          }`}
        >
          {active && <Check className="size-2.5" />}
        </span>
      </div>
      <div>
        <p className="text-sm font-bold text-primary">{route.name}</p>
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">{route.description}</p>
      </div>
      <div className="mt-3 grid grid-cols-[1fr_1fr_1.2fr] gap-2 border-t border-border pt-3">
        <Metric value={`${route.distanceMiles}`} unit="mi" label="Distance" />
        <Metric value={`${hours}h ${minutes}m`} label="Travel time" />
        <div>
          <div className="flex flex-wrap gap-1">
            <span className="rounded-sm bg-danger px-1.5 py-0.5 text-[9px] font-extrabold text-danger-foreground">
              {route.severeMiles} S
            </span>
            <span className="rounded-sm bg-high px-1.5 py-0.5 text-[9px] font-extrabold text-high-foreground">
              {route.highMiles} H
            </span>
          </div>
          <p className="mt-1 text-[9px] font-bold uppercase text-muted-foreground">Risk miles</p>
        </div>
      </div>
    </Button>
  );
}

export function Metric({ value, unit, label }: { value: string; unit?: string; label: string }): React.ReactElement {
  return (
    <div className="pr-2">
      <p className="text-xs font-extrabold">
        {value} <span className="text-[9px] text-muted-foreground">{unit}</span>
      </p>
      <p className="mt-1 text-[9px] font-bold uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

export function WeatherMetric({ icon, value, unit, label }: { icon: React.ReactNode; value: string; unit: string; label: string }): React.ReactElement {
  return (
    <div className="rounded-md bg-background p-2.5">
      <span className="[&>svg]:size-4 text-primary">{icon}</span>
      <p className="mt-2 text-sm font-extrabold">
        {value}
        <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span>
      </p>
      <p className="text-[9px] font-bold uppercase text-muted-foreground">{label}</p>
    </div>
  );
}

export default RouteCard;
