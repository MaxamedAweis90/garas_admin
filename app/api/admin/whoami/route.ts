import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AccountResponse = { $id: string; email?: string; name?: string };

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

    const mainAdminEmail = normalizeEnv(process.env.MAIN_ADMIN_EMAIL) || "mohamedaweis.dev@gmail.com";
    const email = result.data.email ?? "";

    return NextResponse.json({
      userId: result.data.$id,
      email: result.data.email ?? null,
      name: result.data.name ?? null,
      isMainAdmin: email.toLowerCase() === mainAdminEmail.toLowerCase(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const detail = process.env.NODE_ENV === "production" ? undefined : message;
    return NextResponse.json({ error: "server_error", ...(detail ? { detail } : {}) }, { status: 500 });
  }
}
