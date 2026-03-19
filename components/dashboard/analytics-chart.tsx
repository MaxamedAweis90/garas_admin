import { cn } from "@/lib/utils";

export function AnalyticsChart({
  title,
  points,
  className,
}: {
  title: string;
  points: Array<{ label: string; value: number }>;
  className?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="text-xs text-muted-foreground">Last {points.length} days</div>
      </div>

      <div className="grid grid-cols-7 items-end gap-2">
        {points.map((p) => (
          <div key={p.label} className="flex flex-col items-center gap-2">
            <div className="h-24 w-full rounded-xl bg-muted">
              <div
                className="w-full rounded-xl bg-primary/70"
                style={{ height: `${Math.round((p.value / max) * 100)}%` }}
                title={`${p.value}`}
              />
            </div>
            <div className="text-[11px] text-muted-foreground">{p.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
