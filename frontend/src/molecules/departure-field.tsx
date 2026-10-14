import React from "react";
import { format } from "date-fns";
import { ChevronDown, Clock3, X } from "lucide-react";
import { Calendar } from "@/atoms/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/atoms/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/atoms/select";

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour).padStart(2, "0"),
  label: format(new Date(2026, 0, 1, hour), "h a"),
}));
const MINUTE_OPTIONS = ["00", "15", "30", "45"];

interface DepartureFieldProps {
  date: Date | null;
  time: string;
  onDate: (date: Date | null) => void;
  onTime: (time: string) => void;
}

export function DepartureField({ date, time, onDate, onTime }: DepartureFieldProps): React.ReactElement {
  const [hour = "06", minute = "00"] = (time || "06:00").split(":");
  const clock = format(new Date(2026, 0, 1, Number(hour), Number(minute)), "h:mm a");

  const handleSetNow = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(Math.floor(now.getMinutes() / 15) * 15).padStart(2, "0");
    onDate(now);
    onTime(`${h}:${m}`);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDate(null);
    onTime("");
  };

  return (
    <div className="block">
      <span className="mb-1.5 block text-[10px] font-extrabold uppercase text-muted-foreground">
        Departure
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Departure date and time"
            className="flex h-11 w-full items-center gap-2 rounded-full border border-border bg-input-surface px-4 text-sm transition-colors hover:border-border-strong focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/10"
          >
            <span className="text-muted-foreground [&>svg]:size-3.5">
              <Clock3 />
            </span>
            <span className="min-w-0 flex-1 text-left font-semibold">
              {date && time ? (
                <span className="tabular-nums">
                  {format(date, "EEE, d MMM")} · {clock}
                </span>
              ) : (
                <span className="font-normal text-muted-foreground/60">
                  Select departure date & time...
                </span>
              )}
            </span>
            {date && time && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                className="text-muted-foreground transition hover:text-foreground p-0.5"
                aria-label="Clear departure"
              >
                <X className="size-3.5" />
              </span>
            )}
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto rounded-xl border-border bg-panel p-3 text-foreground shadow-float">
          <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
            <span className="text-xs font-bold text-primary">Departure Schedule</span>
            <button
              type="button"
              onClick={handleSetNow}
              className="text-[11px] font-bold text-primary underline underline-offset-2 transition hover:opacity-75"
            >
              Set to current time
            </button>
          </div>
          <Calendar
            mode="single"
            selected={date ?? undefined}
            initialFocus
            className="pointer-events-auto p-0"
            onSelect={(picked) => {
              if (picked) {
                onDate(picked);
                if (!time) {
                  const now = new Date();
                  const h = String(now.getHours()).padStart(2, "0");
                  const m = String(Math.floor(now.getMinutes() / 15) * 15).padStart(2, "0");
                  onTime(`${h}:${m}`);
                }
              }
            }}
          />
          <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
            <p className="section-label mr-auto">Time</p>
            <Select
              value={hour}
              onValueChange={(val) => {
                onTime(`${val}:${minute}`);
                if (!date) onDate(new Date());
              }}
            >
              <SelectTrigger className="h-9 w-[6.5rem] rounded-full border-border bg-input-surface font-semibold shadow-none focus:ring-2 focus:ring-primary/15">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-border bg-panel">
                {HOUR_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="rounded-md focus:bg-muted focus:text-primary">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={minute}
              onValueChange={(val) => {
                onTime(`${hour}:${val}`);
                if (!date) onDate(new Date());
              }}
            >
              <SelectTrigger className="h-9 w-[4.5rem] rounded-full border-border bg-input-surface font-semibold shadow-none focus:ring-2 focus:ring-primary/15">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-border bg-panel">
                {MINUTE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt} className="rounded-md focus:bg-muted focus:text-primary">
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default DepartureField;
