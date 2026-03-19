import { revalidatePath } from "next/cache";
import { Switch } from "@/components/ui/switch";
import { getSystemStatus, setSystemStatus } from "@/lib/admin/ensure-admin-storage";

export const dynamic = "force-dynamic";

export default async function SystemStatusPage() {
  const enabled = await getSystemStatus();

  async function update(formData: FormData) {
    "use server";
    const nextEnabled = String(formData.get("enabled") || "").trim() === "true";
    await setSystemStatus(nextEnabled);
    revalidatePath("/dashboard/system");
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">System Status</h1>
        <p className="mt-1 text-sm text-muted-foreground">Toggle a global system flag stored in Admin-only collections.</p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">System Enabled</div>
            <div className="mt-1 text-xs text-muted-foreground">Stored in garas_admin/system_settings (doc: system)</div>
          </div>

          <form action={update}>
            <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
            <Switch
              checked={enabled}
              onCheckedChange={() => {
                // Server action handles submit; keep client switch purely presentational.
              }}
              label="System enabled"
              type="submit"
            />
          </form>
        </div>
        <div className="mt-4 text-sm">
          Current: <span className={enabled ? "text-emerald-300" : "text-rose-300"}>{enabled ? "Enabled" : "Disabled"}</span>
        </div>
      </section>
    </div>
  );
}
