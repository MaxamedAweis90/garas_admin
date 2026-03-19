import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COOKIE_NAME = "garas_aw_cookie_fallback";

function base64UrlEncode(value: string) {
  if (typeof (globalThis as any).btoa === "function") {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return (globalThis as any)
      .btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as null | { cookieFallback?: string };
  const raw = body?.cookieFallback;
  if (!raw || typeof raw !== "string") {
    return NextResponse.json({ error: "missing_cookie_fallback" }, { status: 400 });
  }

  // Ensure it's valid JSON (Appwrite expects JSON string in X-Fallback-Cookies).
  try {
    JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_cookie_fallback" }, { status: 400 });
  }

  const encoded = base64UrlEncode(raw);
  if (encoded.length > 3800) {
    // Staying safely under common ~4096 cookie limits.
    return NextResponse.json(
      {
        error: "cookie_fallback_too_large",
        hint: "Use an Appwrite custom domain endpoint to enable cookie-based sessions.",
      },
      { status: 413 }
    );
  }

  const jar = await cookies();
  jar.set(COOKIE_NAME, encoded, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return NextResponse.json({ ok: true });
}

