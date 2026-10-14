import React from "react";
import { Navigation } from "lucide-react";

export function Header(): React.ReactElement {
  return (
    <header className="z-30 flex h-12 shrink-0 items-center justify-between px-8 max-sm:h-11 max-sm:px-4 border-b border-border bg-background">
      <div className="flex items-center gap-2 text-primary">
        <Navigation className="size-[18px]" strokeWidth={2.2} />
        <span className="text-[17px] font-extrabold tracking-tight">
          WeatherRoute<span className="text-muted-foreground">.</span>
        </span>
      </div>

      <div className="flex items-center gap-5">
        <span className="hidden items-center gap-1.5 text-[13px] font-semibold text-foreground/80 sm:flex">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          Live forecast
        </span>
      </div>
    </header>
  );
}

export default Header;
