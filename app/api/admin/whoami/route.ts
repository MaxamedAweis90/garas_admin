import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";

type AccountResponse = { $id: string; email?: string; name?: string };

const FALLBACK_COOKIE_NAME = "garas_aw_cookie_fallback";

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "===".slice((normalized.length + 3) % 4);
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
  const base = getAppwriteRestBase();
  const requestHeaders = new Headers(init.headers);
  requestHeaders.set("X-Appwrite-Project", getProjectId());
  requestHeaders.set("X-Appwrite-Response-Format", "1.5.0");

  const res = await fetch(base + path, {
    ...init,
    headers: requestHeaders,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false as const, status: res.status, message: text.slice(0, 200) };
  }

  return { ok: true as const, status: res.status, data: (await res.json()) as T };
}

export async function GET() {
  const cookieHeader = (await headers()).get("cookie");
  const fallbackCookie = (await cookies()).get(FALLBACK_COOKIE_NAME)?.value ?? null;
  const fallbackCookies = fallbackCookie ? base64UrlDecode(fallbackCookie) : null;

  const result = await appwriteFetch<AccountResponse>("/account", {
    method: "GET",
    headers: {
      cookie: cookieHeader ?? "",
      ...(fallbackCookies ? { "X-Fallback-Cookies": fallbackCookies } : {}),
    },
    cache: "no-store",
  });

  if (!result.ok) {
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
}
