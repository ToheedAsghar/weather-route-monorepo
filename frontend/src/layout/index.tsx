import React, { type ReactNode } from "react";
import Header from "./header";

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps): React.ReactElement {
  return (
    <div className="flex h-screen min-h-[680px] flex-col overflow-hidden bg-background font-sans text-foreground">
      <Header />
      <div className="flex min-h-0 flex-1 max-md:overflow-y-auto max-md:flex-col">
        {children}
      </div>
    </div>
  );
}

export default Layout;
