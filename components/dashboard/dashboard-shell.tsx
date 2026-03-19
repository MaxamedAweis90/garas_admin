"use client";

import * as React from "react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { JwtRefresher } from "@/components/auth/jwt-refresher";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex h-dvh min-h-0">
      <JwtRefresher />
      <DashboardSidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl p-6">{children}</div>
      </main>
    </div>
  );
}
