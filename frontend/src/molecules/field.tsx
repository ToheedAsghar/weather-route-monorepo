import React from "react";

interface FieldProps {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}

export function Field({ icon, label, children }: FieldProps): React.ReactElement {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-extrabold uppercase text-muted-foreground">
        {label}
      </span>
      <span className="flex h-11 items-center gap-2 rounded-full border border-border bg-input-surface px-4 text-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10">
        <span className="[&>svg]:size-3.5 text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1 [&_input]:w-full [&_input]:bg-transparent [&_input]:font-semibold [&_input]:outline-none">
          {children}
        </span>
      </span>
    </label>
  );
}

export default Field;
