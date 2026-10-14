import React from "react";
import { CloudRain, Snowflake, Wind, X } from "lucide-react";
import { Button } from "@/atoms/button";
import { WeatherMetric } from "./route-card";
import type { Checkpoint, WeatherSnapshot } from "@/common/types";

interface CheckpointCardProps {
  checkpoint: Checkpoint;
  snapshot: WeatherSnapshot;
  onClose: () => void;
}

export function CheckpointCard({ checkpoint, snapshot, onClose }: CheckpointCardProps): React.ReactElement {
  return (
    <div className="absolute right-5 top-5 z-10 w-72 rounded-md border border-border bg-panel p-4 shadow-float max-md:bottom-40 max-md:left-3 max-md:right-3 max-md:top-auto max-md:w-auto">
      <div className="flex items-start justify-between">
        <div>
          <p className="section-label">Checkpoint / {checkpoint.eta}</p>
          <h3 className="mt-1 text-base font-extrabold">{checkpoint.name}</h3>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Close checkpoint"
          className="size-7 text-muted-foreground"
        >
          <X />
        </Button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <WeatherMetric icon={<Wind />} value={`${snapshot.windMph}`} unit="mph" label="Wind" />
        <WeatherMetric icon={<CloudRain />} value={`${snapshot.rainIn}`} unit="in" label="Rain" />
        <WeatherMetric icon={<Snowflake />} value={`${snapshot.snowIn}`} unit="in" label="Snow" />
      </div>
    </div>
  );
}

export default CheckpointCard;
