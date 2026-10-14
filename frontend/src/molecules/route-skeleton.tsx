import React from "react";

export function RouteSkeleton(): React.ReactElement {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((item) => (
        <div key={item} className="animate-pulse rounded-md border border-border p-3">
          <div className="h-3 w-32 rounded bg-muted" />
          <div className="mt-2 h-2 w-48 rounded bg-muted" />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <i className="h-8 rounded bg-muted" />
            <i className="h-8 rounded bg-muted" />
            <i className="h-8 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default RouteSkeleton;
