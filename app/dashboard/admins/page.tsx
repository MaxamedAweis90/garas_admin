import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { AppwriteException } from "node-appwrite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getServerTeams } from "@/lib/appwrite/server";

export const dynamic = "force-dynamic";

type TeamsListResponse = { teams: Array<{ $id: string; name: string }>; total: number };

function normalizeEnv(value: string | undefined) {
  return (value ?? "").trim().replace(/^['\"]|['\"]$/g, "");
}

function getAppwriteRestBase() {
  const endpoint = normalizeEnv(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT);
  if (!endpoint) {
    throw new Error("NEXT_PUBLIC_APPWRITE_ENDPOINT missing");
  }
  const trimmed = endpoint.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : trimmed + "/v1";
}

function getProjectId() {
  const projectId = normalizeEnv(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID);
  if (!projectId) {
    throw new Error("NEXT_PUBLIC_APPWRITE_PROJECT_ID missing");
  }
  return projectId;
}

async function getCurrentAccountEmail() {
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const res = await fetch(getAppwriteRestBase() + "/account", {
    method: "GET",
    headers: {
      cookie: cookieHeader,
      "X-Appwrite-Project": getProjectId(),
      "X-Appwrite-Response-Format": "1.5.0",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

async function getRequestOrigin() {
  // Works for localhost, Vercel, reverse proxies, etc.
  // Prefer forwarded headers when present.
  const h = await headers();
  const forwardedProto = h.get("x-forwarded-proto");
  const proto = forwardedProto || (process.env.NODE_ENV === "production" ? "https" : "http");

  const forwardedHost = h.get("x-forwarded-host");
  const host = forwardedHost || h.get("host") || "localhost:3000";

  return `${proto}://${host}`;
}

async function getAdminTeamId() {
  const teamsApi = getServerTeams();
  const result = (await teamsApi.list({ search: "Admin" })) as unknown as TeamsListResponse;
  const team = result.teams.find((item) => item.name === "Admin") ?? null;
  return team?.$id ?? null;
}

export default async function AdminsPage() {
  const mainAdminEmail = normalizeEnv(process.env.MAIN_ADMIN_EMAIL) || "mohamedaweis.dev@gmail.com";
  const currentEmail = await getCurrentAccountEmail();
  const isMainAdmin = Boolean(currentEmail && currentEmail.toLowerCase() === mainAdminEmail.toLowerCase());

  async function invite(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "").trim();
    if (!email) {
      return;
    }

    const mainAdminEmail = normalizeEnv(process.env.MAIN_ADMIN_EMAIL) || "mohamedaweis.dev@gmail.com";
    const currentEmail = await getCurrentAccountEmail();
    if (!currentEmail || currentEmail.toLowerCase() !== mainAdminEmail.toLowerCase()) {
      throw new Error("Only the main admin can invite other admins.");
    }

    const teamId = await getAdminTeamId();
    if (!teamId) {
      throw new Error('Appwrite Team "Admin" not found. Create it in Appwrite Console first.');
    }

    const inviteUrl = normalizeEnv(process.env.ADMIN_INVITE_REDIRECT_URL) || `${await getRequestOrigin()}/login`;

    const teamsApi = getServerTeams();
    try {
      await teamsApi.createMembership(teamId, ["admin"], email, undefined, undefined, inviteUrl, "GARAS Admin");
    } catch (error: any) {
      if (error instanceof AppwriteException) {
        throw new Error(error.message);
      }
      throw error;
    }

    revalidatePath("/dashboard/admins");
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">Admins</h1>
        <p className="mt-1 text-sm text-muted-foreground">Only the main admin can invite other admins.</p>
      </header>

      {!isMainAdmin ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Access denied. Sign in as the main admin to manage admins.</p>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-5">
          <form action={invite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Invite admin by email</Label>
              <Input id="email" name="email" type="email" placeholder="new-admin@example.com" required />
              <p className="text-xs text-muted-foreground">This sends an Appwrite team invitation to the email.</p>
            </div>

            <Button type="submit" className="h-10">Send invite</Button>
          </form>
        </section>
      )}
    </div>
  );
}
