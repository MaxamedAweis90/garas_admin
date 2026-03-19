import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center p-6">
      <div className="rounded-3xl border border-border bg-card p-6">
        <h1 className="text-lg font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your account is not a member of the Appwrite Team <span className="font-medium">Admin</span>.
        </p>
        <div className="mt-5 flex gap-2">
          <Button asChild variant="outline">
            <Link href="/login">Back to login</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Try again</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
