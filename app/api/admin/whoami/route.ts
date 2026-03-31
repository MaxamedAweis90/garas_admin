import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AccountResponse = { $id: string; email?: string; name?: string };
type DocumentListResponse = { documents: Array<{ $id: string; userId: string; role: string }>; total: number };

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

function getAdminDatabaseId() {
  return normalizeEnv(process.env.APPWRITE_ADMIN_DATABASE_ID) || "garas_admin";
}

function getAdminUsersCollectionId() {
  return normalizeEnv(process.env.APPWRITE_ADMIN_USERS_COLLECTION_ID) || "admin_users";
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

async function isAdminUser(userId: string) {
  const dbId = getAdminDatabaseId();
  const colId = getAdminUsersCollectionId();

  const queries = [
    `equal("userId", ["${userId}"])`,
    "limit(1)",
  ].map((q) => `queries[]=${encodeURIComponent(q)}`);

  const records = await appwriteApiKeyFetch<DocumentListResponse>(`/databases/${dbId}/collections/${colId}/documents?${queries.join("&")}`, {
    method: "GET",
  });

  if (!records.ok) {
    // If collection doesn't exist, we might get 404. Let's just return false unless it's a 50x error.
    if (records.status >= 500) {
      return { ok: false as const, status: records.status };
    }
    return { ok: true as const, isAdmin: false, role: null };
  }

  const userDoc = records.data.documents[0];
  if (!userDoc) {
    return { ok: true as const, isAdmin: false, role: null };
  }

  return { ok: true as const, isAdmin: true, role: userDoc.role };
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
    const isAllowedByEmail = isAdminEmail(email);
    let isMainAdmin = Boolean(mainAdminEmail) && email.toLowerCase() === mainAdminEmail.toLowerCase();

    let isAllowedByDb = false;
    let storedRole = null;
    
    const dbCheck = await isAdminUser(result.data.$id);
    if (!dbCheck.ok) {
      if (dbCheck.status >= 500) {
        return NextResponse.json({ error: "appwrite_unreachable" }, { status: 500 });
      }
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    
    isAllowedByDb = dbCheck.isAdmin;
    storedRole = dbCheck.role;

    // Upgrade to main admin if role is 'main_admin' in DB
    if (storedRole === "main_admin") {
      isMainAdmin = true;
    }

    if (!isAllowedByEmail && !isAllowedByDb) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      userId: result.data.$id,
      email: result.data.email ?? null,
      name: result.data.name ?? null,
      isMainAdmin,
      role: storedRole || (isMainAdmin ? 'main_admin' : 'admin'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const detail = process.env.NODE_ENV === "production" ? undefined : message;
    return NextResponse.json({ error: "server_error", ...(detail ? { detail } : {}) }, { status: 500 });
  }
}
