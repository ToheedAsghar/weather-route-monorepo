import React from "react";
import { Clock3, CloudRain, Snowflake, Wind, X } from "lucide-react";
import { Button } from "@/atoms/button";
import { RISK_CONFIG } from "@/constants";
import type { Checkpoint, WeatherSnapshot } from "@/common/types";

interface CheckpointCardProps {
  checkpoint: Checkpoint;
  snapshot: WeatherSnapshot;
  forecastHour: number;
  forecastTimeLabel: string;
  onForecastChange: (hour: number) => void;
  onClose: () => void;
}

export function CheckpointCard({
  checkpoint,
  snapshot,
  forecastHour,
  forecastTimeLabel,
  onForecastChange,
  onClose,
}: CheckpointCardProps): React.ReactElement {
  const riskMeta = RISK_CONFIG[checkpoint.risk] || RISK_CONFIG.low;

  return (
    <div className="absolute right-5 top-5 z-20 w-80 rounded-xl border border-border bg-background/95 p-4 shadow-float backdrop-blur-xl max-md:bottom-5 max-md:left-3 max-md:right-3 max-md:top-auto max-md:w-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">
              Checkpoint · ETA {checkpoint.eta}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold ${riskMeta.badgeClass} ${
                checkpoint.risk === "no-travel" || checkpoint.risk === "severe" ? "text-white" : "text-foreground"
              }`}
            >
              {riskMeta.label}
            </span>
          </div>
          <h3 className="mt-1 text-base font-extrabold text-primary truncate">{checkpoint.name}</h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close checkpoint"
          className="size-7 shrink-0 text-muted-foreground hover:bg-panel hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* 3 Metric cards */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-panel/90 p-2.5 shadow-sm text-center">
          <div className="flex items-center justify-center text-primary">
            <Wind className="size-4" />
          </div>
          <p className="mt-1 text-sm font-extrabold text-primary">
            {snapshot.windMph}
            <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">mph</span>
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Wind</p>
        </div>

        <div className="rounded-lg border border-border bg-panel/90 p-2.5 shadow-sm text-center">
          <div className="flex items-center justify-center text-primary">
            <CloudRain className="size-4" />
          </div>
          <p className="mt-1 text-sm font-extrabold text-primary">
            {snapshot.rainIn}
            <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">in</span>
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Rain</p>
        </div>

        <div className="rounded-lg border border-border bg-panel/90 p-2.5 shadow-sm text-center">
          <div className="flex items-center justify-center text-primary">
            <Snowflake className="size-4" />
          </div>
          <p className="mt-1 text-sm font-extrabold text-primary">
            {snapshot.snowIn}
            <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">in</span>
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Snow</p>
        </div>
      </div>

      {/* Timeline Slider Section */}
      <div className="mt-3.5 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="grid size-5 place-items-center rounded-full bg-primary text-background">
              <Clock3 className="size-3" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Weather intensity
            </span>
          </div>
          <div className="shrink-0 rounded-full border border-border bg-panel px-2.5 py-0.5 text-right shadow-sm">
            <span className="text-[10px] font-extrabold tabular-nums text-primary">
              {forecastTimeLabel}
            </span>
            <span className="ml-1 text-[9px] font-semibold text-muted-foreground">
              ({forecastHour === 0 ? "Now" : `+${forecastHour}h`})
            </span>
          </div>
        </div>

        <div className="relative mt-2.5">
          <input
            aria-label="Forecast hour"
            type="range"
            min="0"
            max="48"
            step="1"
            value={forecastHour}
            onChange={(event) => onForecastChange(Number(event.target.value))}
            className="forecast-slider w-full"
            style={{ "--fill": `${(forecastHour / 48) * 100}%` } as React.CSSProperties}
          />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-between px-[6px]">
            {[0, 12, 24, 36, 48].map((tick) => (
              <span
                key={tick}
                className={`size-1 rounded-full transition-colors ${
                  forecastHour >= tick ? "bg-panel" : "bg-border-strong"
                }`}
              />
            ))}
          </div>
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-bold text-muted-foreground">
          {[0, 12, 24, 36, 48].map((tick) => (
            <span key={tick} className={forecastHour >= tick ? "text-primary" : ""}>
              {tick === 0 ? "NOW" : `${tick}H`}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CheckpointCard;
