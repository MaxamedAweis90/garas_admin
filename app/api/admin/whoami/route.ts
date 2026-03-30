import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AccountResponse = { $id: string; email?: string; name?: string };
type TeamListResponse = { teams: Array<{ $id: string; name: string }>; total: number };
type MembershipListResponse = { memberships: Array<{ $id: string; userId: string; confirm?: boolean; joined?: string | null }>; total: number };

const FALLBACK_COOKIE_NAME = "garas_aw_cookie_fallback";
const JWT_COOKIE_NAME = "garas_aw_jwt";

function base64UrlDecodeUtf8(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);

  if (typeof (globalThis as any).atob === "function") {
    const binary = (globalThis as any).atob(padded) as string;
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  // Node.js fallback
  return Buffer.from(padded, "base64").toString("utf8");
}

function normalizeEnv(value: string | undefined) {
  return (value ?? "").trim().replace(/^['\"]|['\"]$/g, "");
}

function getAdminTeamName() {
  return normalizeEnv(process.env.ADMIN_TEAM_NAME) || "Admin";
}

function getAdminTeamIdFromEnv() {
  return normalizeEnv(process.env.ADMIN_TEAM_ID) || null;
}

function getAdminEmails() {
  const set = new Set<string>();
  const mainAdmin = normalizeEnv(process.env.MAIN_ADMIN_EMAIL);
  const extraAdmins = normalizeEnv(process.env.ADMIN_EMAILS);

  if (mainAdmin) {
    set.add(mainAdmin.toLowerCase());
  }

  if (extraAdmins) {
    for (const item of extraAdmins.split(",")) {
      const email = item.trim().toLowerCase();
      if (email) {
        set.add(email);
      }
    }
  }

  return set;
}

function isAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }
  return getAdminEmails().has(email.toLowerCase());
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

function getApiKey() {
  const apiKey = normalizeEnv(process.env.APPWRITE_API_KEY);
  if (!apiKey) {
    throw new Error("APPWRITE_API_KEY missing");
  }
  return apiKey;
}

async function appwriteFetch<T>(path: string, init: RequestInit) {
  try {
    const base = getAppwriteRestBase();
    const requestHeaders = new Headers(init.headers);
    requestHeaders.set("X-Appwrite-Project", getProjectId());
    requestHeaders.set("X-Appwrite-Response-Format", "1.5.0");

    const res = await fetch(base + path, {
      ...init,
      headers: requestHeaders,
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false as const, status: res.status, message: text.slice(0, 200) };
    }

    const json = (await res.json().catch(() => null)) as T | null;
    if (!json) {
      return { ok: false as const, status: 502, message: "Invalid JSON from Appwrite" };
    }

    return { ok: true as const, status: res.status, data: json };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, status: 502, message };
  }
}

async function appwriteApiKeyFetch<T>(path: string, init: RequestInit) {
  const base = getAppwriteRestBase();
  const requestHeaders = new Headers(init.headers);
  requestHeaders.set("X-Appwrite-Project", getProjectId());
  requestHeaders.set("X-Appwrite-Key", getApiKey());
  requestHeaders.set("X-Appwrite-Response-Format", "1.5.0");

  const res = await fetch(base + path, {
    ...init,
    headers: requestHeaders,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false as const, status: res.status, message: text.slice(0, 200) };
  }

  return { ok: true as const, status: res.status, data: (await res.json()) as T };
}

async function getAdminTeamId() {
  const teamIdFromEnv = getAdminTeamIdFromEnv();
  if (teamIdFromEnv) {
    return { ok: true as const, id: teamIdFromEnv };
  }

  const adminTeamName = getAdminTeamName();
  const teamsResult = await appwriteApiKeyFetch<TeamListResponse>(`/teams?search=${encodeURIComponent(adminTeamName)}`, {
    method: "GET",
  });

  if (!teamsResult.ok) {
    return { ok: false as const, status: teamsResult.status };
  }

  const team = teamsResult.data.teams.find((item) => item.name === adminTeamName) ?? null;
  if (!team) {
    return { ok: true as const, id: null as string | null };
  }

  return { ok: true as const, id: team.$id };
}

async function isAdminTeamMember(userId: string) {
  const teamResult = await getAdminTeamId();
  if (!teamResult.ok) {
    return { ok: false as const, status: teamResult.status };
  }

  if (!teamResult.id) {
    return { ok: true as const, isAdmin: false };
  }

  const queries = [
    `equal("userId", ["${userId}"])`,
    "limit(25)",
  ].map((q) => `queries[]=${encodeURIComponent(q)}`);

  const memberships = await appwriteApiKeyFetch<MembershipListResponse>(`/teams/${teamResult.id}/memberships?${queries.join("&")}`, {
    method: "GET",
  });

  if (!memberships.ok) {
    return { ok: false as const, status: memberships.status };
  }

  const isAdmin = memberships.data.memberships.some((membership) => {
    if (membership.userId !== userId) {
      return false;
    }
    return membership.confirm === true || Boolean(membership.joined);
  });

  return { ok: true as const, isAdmin };
}

export async function GET() {
  try {
    const cookieHeader = (await headers()).get("cookie");
    const jar = await cookies();
    const jwt = jar.get(JWT_COOKIE_NAME)?.value ?? null;
    const fallbackCookie = jar.get(FALLBACK_COOKIE_NAME)?.value ?? null;

    let fallbackCookies: string | null = null;
    if (fallbackCookie) {
      try {
        fallbackCookies = base64UrlDecodeUtf8(fallbackCookie);
      } catch {
        fallbackCookies = null;
      }
    }

    const result = await appwriteFetch<AccountResponse>("/account", {
      method: "GET",
      headers: {
        ...(jwt ? { "X-Appwrite-JWT": jwt } : {}),
        ...(jwt ? {} : { cookie: cookieHeader ?? "" }),
        ...(!jwt && fallbackCookies ? { "X-Fallback-Cookies": fallbackCookies } : {}),
      },
    });

    if (!result.ok) {
      // If Appwrite is unreachable or env is missing, don't mislead as "unauthenticated".
      if (result.status >= 500) {
        return NextResponse.json({ error: "appwrite_unreachable" }, { status: 500 });
      }

      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }

    const mainAdminEmail = normalizeEnv(process.env.MAIN_ADMIN_EMAIL);
    const email = result.data.email ?? "";
    const isMainAdmin = Boolean(mainAdminEmail) && email.toLowerCase() === mainAdminEmail.toLowerCase();
    const isAllowedByEmail = isAdminEmail(email);

    let isAllowedByTeam = false;
    if (!isAllowedByEmail) {
      const membership = await isAdminTeamMember(result.data.$id);
      if (!membership.ok) {
        if (membership.status >= 500) {
          return NextResponse.json({ error: "appwrite_unreachable" }, { status: 500 });
        }
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      isAllowedByTeam = membership.isAdmin;
    }

    if (!isAllowedByEmail && !isAllowedByTeam) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      userId: result.data.$id,
      email: result.data.email ?? null,
      name: result.data.name ?? null,
      isMainAdmin,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const detail = process.env.NODE_ENV === "production" ? undefined : message;
    return NextResponse.json({ error: "server_error", ...(detail ? { detail } : {}) }, { status: 500 });
  }
}
