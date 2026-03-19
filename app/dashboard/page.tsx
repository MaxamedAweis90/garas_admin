import { AnalyticsChart } from "@/components/dashboard/analytics-chart";
import { appwriteConfig } from "@/lib/appwrite/config";
import { getServerDatabases, Query } from "@/lib/appwrite/server";

export const dynamic = "force-dynamic";

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

async function getMessageCountsLastNDays(days: number) {
  const databases = getServerDatabases();
  const points: Array<{ label: string; value: number }> = [];
  const today = startOfUtcDay(new Date());

  for (let i = days - 1; i >= 0; i -= 1) {
    const dayStart = new Date(today);
    dayStart.setUTCDate(dayStart.getUTCDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const dayStartIso = dayStart.toISOString();
    const dayEndIso = dayEnd.toISOString();

    const result = await databases.listDocuments(appwriteConfig.databaseId, appwriteConfig.messagesCollectionId, [
      Query.greaterThanEqual("createdAt", dayStartIso),
      Query.lessThan("createdAt", dayEndIso),
      Query.limit(1),
    ]);

    points.push({ label: formatDayLabel(dayStart), value: typeof result.total === "number" ? result.total : 0 });
  }

  return points;
}

export default async function DashboardOverviewPage() {
  const points = await getMessageCountsLastNDays(7);

  const totalMessages = points.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Monitor users, chats, and system settings.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="text-xs text-muted-foreground">Messages (7d)</div>
            <div className="mt-2 text-2xl font-semibold">{totalMessages}</div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="text-xs text-muted-foreground">Collection</div>
            <div className="mt-2 text-sm font-medium">{appwriteConfig.messagesCollectionId}</div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="text-xs text-muted-foreground">Database</div>
            <div className="mt-2 text-sm font-medium">{appwriteConfig.databaseId}</div>
          </div>
        </div>
      </header>

      <AnalyticsChart title="Chat Analytics" points={points} />
    </div>
  );
}
