import React from "react";
import { Clock3 } from "lucide-react";

interface ForecastSliderProps {
  forecastHour: number;
  forecastTimeLabel: string;
  onForecastChange: (hour: number) => void;
}

export function ForecastSlider({
  forecastHour,
  forecastTimeLabel,
  onForecastChange,
}: ForecastSliderProps): React.ReactElement {
  return (
    <div className="absolute bottom-5 left-1/2 z-10 w-[min(540px,calc(100%-3rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-border-strong/30 bg-background/92 shadow-float backdrop-blur-xl max-md:bottom-3 max-md:w-[calc(100%-1.5rem)]">
      <div className="px-4 pb-3 pt-2.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-background shadow-action">
              <Clock3 className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-extrabold uppercase tracking-[0.16em] text-primary">
                Weather intensity
              </p>
              <p className="mt-0.5 text-[10px] font-medium leading-4 text-muted-foreground">
                Corridor risk along the selected route
              </p>
            </div>
          </div>
          <div className="shrink-0 rounded-full border border-border bg-panel px-3 py-1 text-right shadow-card">
            <p className="text-[11px] font-extrabold tabular-nums leading-tight text-primary">
              {forecastTimeLabel}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
              {forecastHour === 0 ? "Departure" : `+${forecastHour}h out`}
            </p>
          </div>
        </div>
        <div className="relative mt-3">
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
        <div className="mt-1.5 flex justify-between text-[9px] font-bold text-muted-foreground">
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

export default ForecastSlider;
