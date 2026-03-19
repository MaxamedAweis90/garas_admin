import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const JWT_COOKIE_NAME = "garas_aw_jwt";

function normalizeEnv(value: string | undefined) {
  return (value ?? "").trim().replace(/^['\"]|['\"]$/g, "");
}

function isProbablyJwt(value: string) {
  // Appwrite JWTs are standard JWT strings (three dot-separated base64url parts)
  const parts = value.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as null | { jwt?: string };
  const jwt = normalizeEnv(body?.jwt);

  if (!jwt || !isProbablyJwt(jwt)) {
    return NextResponse.json({ error: "invalid_jwt" }, { status: 400 });
  }

  const jar = await cookies();
  jar.set(JWT_COOKIE_NAME, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Cookie lifetime can be longer than JWT; JWT expiry is enforced by Appwrite.
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.set(JWT_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });

  return NextResponse.json({ ok: true });
}
