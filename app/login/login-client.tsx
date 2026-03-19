"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AppwriteException } from "appwrite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAccount, getAppwriteConfigError, isAppwriteConfigured } from "@/lib/appwrite/client";

const loginSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type LoginValues = z.infer<typeof loginSchema>;

function getErrorMessage(error: unknown) {
  if (error instanceof AppwriteException) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Login failed.";
}

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next") || "/dashboard";
  const nextPath = nextParam.startsWith("/") ? nextParam : "/dashboard";
  const [formError, setFormError] = useState<string | null>(null);
  const [showLogout, setShowLogout] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginValues>({
    defaultValues: { email: "", password: "" },
  });

  async function syncFallbackCookie() {
    try {
      const cookieFallback = window.localStorage?.getItem("cookieFallback");
      if (!cookieFallback) {
        return;
      }
      await fetch("/api/auth/fallback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cookieFallback }),
      });
    } catch {
      // ignore
    }
  }

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    setShowLogout(false);

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => {
        const field = issue.path[0];
        if (field === "email" || field === "password") {
          setError(field, { message: issue.message });
        }
      });
      return;
    }

    startTransition(() => {
      void (async () => {
        const account = getAccount();

        // If a session is already active, Appwrite blocks creating a new one.
        // Sign out first so the user can switch accounts.
        try {
          await account.deleteSession("current");
        } catch {
          // ignore
        }

        await account.createEmailPasswordSession(parsed.data.email, parsed.data.password);

        // Ensure Appwrite updates cookieFallback before we sync it.
        try {
          await account.get();
        } catch {
          // ignore
        }

        await syncFallbackCookie();

        const res = await fetch("/api/admin/whoami", { method: "GET" });
        if (res.ok) {
          router.replace(nextPath as any);
          router.refresh();
          return;
        }

        try {
          await account.deleteSession("current");
        } catch {
          // ignore
        }

        try {
          window.localStorage?.removeItem("cookieFallback");
          await fetch("/api/auth/fallback", { method: "DELETE" });
        } catch {
          // ignore
        }

        if (res.status === 403) {
          setFormError("This account is not an Admin. Access denied.");
          setShowLogout(false);
          return;
        }

        setFormError("Login failed.");
      })().catch((error) => setFormError(getErrorMessage(error)));
    });
  });

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        // If Appwrite is using localStorage sessions, copy cookieFallback into a
        // first-party cookie so middleware can authenticate.
        await syncFallbackCookie();

        const res = await fetch("/api/admin/whoami", { method: "GET" });
        if (cancelled) return;

        if (res.ok) {
          router.replace(nextPath as any);
          router.refresh();
          return;
        }

        if (res.status === 403) {
          setFormError("You are already signed in with a non-admin account. Sign out to continue.");
          setShowLogout(true);
        }
      } finally {
        if (!cancelled) {
          setIsCheckingSession(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  const configError = isAppwriteConfigured() ? null : getAppwriteConfigError();

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center p-6">
      <div className="rounded-3xl border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">GARAS Admin Login</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in with your Appwrite account.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" placeholder="name@example.com" {...register("email")} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" placeholder="••••••••" {...register("password")} />
            {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
          </div>

          {configError && <p className="rounded-2xl border border-border bg-muted px-4 py-3 text-sm">{configError}</p>}
          {formError && <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">{formError}</p>}

          <Button type="submit" className="h-10 w-full" disabled={isPending || isCheckingSession || Boolean(configError)}>
            {isCheckingSession ? "Checking session..." : isPending ? "Signing in..." : "Sign in"}
          </Button>

          {showLogout && (
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full"
              onClick={() => {
                setFormError(null);
                startTransition(() => {
                  void getAccount()
                    .deleteSession("current")
                    .then(() => {
                      try {
                        window.localStorage?.removeItem("cookieFallback");
                        void fetch("/api/auth/fallback", { method: "DELETE" });
                      } catch {
                        // ignore
                      }
                      setShowLogout(false);
                      router.refresh();
                    })
                    .catch((error) => setFormError(getErrorMessage(error)));
                });
              }}
              disabled={isPending}
            >
              Sign out
            </Button>
          )}
        </form>
      </div>
    </div>
  );
}
