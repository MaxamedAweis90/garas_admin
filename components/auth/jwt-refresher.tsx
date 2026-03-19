"use client";

import * as React from "react";
import { AppwriteException } from "appwrite";
import { getAccount } from "@/lib/appwrite/client";

async function setJwtCookie(jwt: string) {
  await fetch("/api/auth/jwt", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jwt }),
    cache: "no-store",
  });
}

function isUnauthorized(error: unknown) {
  return error instanceof AppwriteException && error.code === 401;
}

/**
 * Keeps an Appwrite JWT mirrored into a first-party httpOnly cookie.
 * This makes server middleware + API routes stable even when Appwrite uses localStorage sessions.
 */
export function JwtRefresher() {
  React.useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const run = async () => {
      try {
        const account = getAccount();
        // If no session exists, this will throw 401.
        await account.get();
        const jwt = await account.createJWT();
        if (cancelled) return;
        await setJwtCookie(jwt.jwt);
      } catch (error) {
        if (isUnauthorized(error)) {
          // Not logged in; make sure we don't keep a stale JWT cookie around.
          try {
            await fetch("/api/auth/jwt", { method: "DELETE", cache: "no-store" });
          } catch {
            // ignore
          }
        }
      }
    };

    void run();

    // Refresh periodically to reduce expiry-related redirects.
    intervalId = window.setInterval(() => {
      void run();
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      if (intervalId) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  return null;
}
