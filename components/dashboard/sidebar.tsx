"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Settings, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function DashboardSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();

  const nav = [
    { href: "/dashboard", label: "Overview", icon: BarChart3 },
    { href: "/dashboard/users", label: "User Management", icon: Users },
    { href: "/dashboard/admins", label: "Admins", icon: Shield },
    { href: "/dashboard/system", label: "System Status", icon: Settings },
  ] as const;

  return (
    <aside
      className={cn(
        "h-full min-h-0 border-r border-border bg-sidebar text-sidebar-foreground",
        collapsed ? "w-16" : "w-64",
        "transition-[width]"
      )}
    >
      <div className={cn("flex items-center gap-3 px-4 py-4", collapsed && "justify-center px-0")}
      >
        <div className="flex size-9 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-accent-foreground">
          <Shield className="size-5" />
        </div>
        {!collapsed && (
          <div>
            <div className="text-sm font-semibold">GARAS Admin</div>
            <div className="text-xs text-muted-foreground">Dashboard</div>
          </div>
        )}
      </div>

      <div className="px-3">
        <Button
          variant="outline"
          className={cn("w-full justify-start", collapsed && "justify-center px-0")}
          onClick={onToggle}
        >
          {collapsed ? "»" : "Collapse"}
        </Button>
      </div>

      <nav className="mt-4 space-y-1 px-2">
        {nav.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href as any}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-0"
              )}
            >
              <Icon className="size-4" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
