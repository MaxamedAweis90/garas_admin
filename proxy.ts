import { NextResponse, type NextRequest } from "next/server";

type TeamListResponse = { teams: Array<{ $id: string; name: string }>; total: number };
type MembershipListResponse = { memberships: Array<{ $id: string; userId: string; confirm?: boolean; joined?: string | null }>; total: number };
type AccountResponse = { $id: string; email?: string; name?: string };
type AppwriteFetchInit = RequestInit & { apiKeyAuth?: boolean; fallbackCookies?: string };

const FALLBACK_COOKIE_NAME = "garas_aw_cookie_fallback";
const JWT_COOKIE_NAME = "garas_aw_jwt";

let cachedAdminTeamId: { id: string; expiresAtMs: number } | null = null;

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
  const main = normalizeEnv(process.env.MAIN_ADMIN_EMAIL);
  const extra = normalizeEnv(process.env.ADMIN_EMAILS);
  const set = new Set<string>();

  if (main) {
    set.add(main.toLowerCase());
  }

  if (extra) {
    for (const part of extra.split(",")) {
      const email = part.trim().toLowerCase();
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
    return null;
  }
  const trimmed = endpoint.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : trimmed + "/v1";
}

function getProjectId() {
  const projectId = normalizeEnv(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID);
  if (!projectId) {
    return null;
  }
  return projectId;
}

function getApiKey() {
  const apiKey = normalizeEnv(process.env.APPWRITE_API_KEY);
  if (!apiKey) {
    return null;
  }
  return apiKey;
}

async function appwriteFetch<T>(path: string, init: AppwriteFetchInit = {}) {
  const base = getAppwriteRestBase();
  const projectId = getProjectId();
  if (!base || !projectId) {
    return null;
  }

  const headers = new Headers(init.headers);
  headers.set("X-Appwrite-Project", projectId);
  headers.set("X-Appwrite-Response-Format", "1.5.0");

  if (init.fallbackCookies) {
    headers.set("X-Fallback-Cookies", init.fallbackCookies);
  }

  if (init.apiKeyAuth) {
    const apiKey = getApiKey();
    if (!apiKey) {
      return null;
    }
    headers.set("X-Appwrite-Key", apiKey);
  }

  try {
    const res = await fetch(base + path, {
      ...init,
      headers,
    });

    if (!res.ok) {
      return null;
    }

    return (await res.json().catch(() => null)) as T | null;
  } catch {
    return null;
  }
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
  // atob expects standard base64
  return atob(padded);
}

async function getAccountFromSessionCookie(cookieHeader: string | null, fallbackCookies: string | null, jwt: string | null) {
  if (!jwt && !cookieHeader && !fallbackCookies) {
    return null;
  }

  try {
    const account = await appwriteFetch<AccountResponse>("/account", {
      method: "GET",
      headers: {
        ...(jwt ? { "X-Appwrite-JWT": jwt } : {}),
        ...(jwt ? {} : { cookie: cookieHeader ?? "" }),
      },
      ...(fallbackCookies ? { fallbackCookies } : {}),
    });
    return account;
  } catch {
    return null;
  }
}

async function getAdminTeamId() {
  const teamIdFromEnv = getAdminTeamIdFromEnv();
  if (teamIdFromEnv) {
    return teamIdFromEnv;
  }

  const now = Date.now();
  if (cachedAdminTeamId && cachedAdminTeamId.expiresAtMs > now) {
    return cachedAdminTeamId.id;
  }

  const adminTeamName = getAdminTeamName();
  const data = await appwriteFetch<TeamListResponse>(`/teams?search=${encodeURIComponent(adminTeamName)}`, {
    method: "GET",
    apiKeyAuth: true,
  });

  if (!data) {
    return null;
  }

  const team = data.teams.find((item) => item.name === adminTeamName) ?? null;
  if (!team) {
    return null;
  }

  cachedAdminTeamId = { id: team.$id, expiresAtMs: now + 5 * 60_000 };
  return team.$id;
}

async function isUserInAdminTeam(userId: string) {
  const teamId = await getAdminTeamId();
  if (!teamId) {
    return false;
  }

  // Appwrite REST expects query strings like: equal("userId", ["..."])
  const queries = [`equal("userId", ["${userId}"])`, "limit(25)"].map((q) => `queries[]=${encodeURIComponent(q)}`);

  const data = await appwriteFetch<MembershipListResponse>(`/teams/${teamId}/memberships?${queries.join("&")}`, {
    method: "GET",
    apiKeyAuth: true,
  });

  if (!data) {
    return false;
  }

  return data.memberships.some((membership) => {
    if (membership.userId !== userId) {
      return false;
    }

    // Appwrite membership confirmation is represented by `confirm`/`joined`, not `status`.
    return membership.confirm === true || Boolean(membership.joined);
  });
}

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const isApiRequest = url.pathname.startsWith("/api/");

  // Let whoami perform its own checks and return explicit diagnostics.
  if (url.pathname === "/api/admin/whoami") {
    return NextResponse.next();
  }

  try {
    const cookieHeader = request.headers.get("cookie");
    const jwt = request.cookies.get(JWT_COOKIE_NAME)?.value ?? null;
    const fallbackCookie = request.cookies.get(FALLBACK_COOKIE_NAME)?.value ?? null;

    let fallbackCookies: string | null = null;
    if (fallbackCookie) {
      try {
        fallbackCookies = base64UrlDecode(fallbackCookie);
      } catch {
        fallbackCookies = null;
      }
    }

    const account = await getAccountFromSessionCookie(cookieHeader, fallbackCookies, jwt);

    if (!account) {
      if (isApiRequest) {
        return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
      }

      const loginUrl = new URL("/login", url);
      loginUrl.searchParams.set("next", url.pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Email allowlist gives a reliable fallback when this app and another app share users
    // but use different admin-team structures.
    const isAllowedByEmail = isAdminEmail(account.email);
    const ok = isAllowedByEmail || (await isUserInAdminTeam(account.$id));

    if (!ok) {
      if (isApiRequest) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }

      return NextResponse.rewrite(new URL("/unauthorized", url));
    }

    return NextResponse.next();
  } catch {
    // Misconfiguration or transient Appwrite failure.
    if (isApiRequest) {
      return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
    }
    return NextResponse.rewrite(new URL("/login", url));
  }
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/admin/:path*"],
};
