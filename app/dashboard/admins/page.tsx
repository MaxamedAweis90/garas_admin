import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { AppwriteException } from "node-appwrite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getServerDatabases, getServerUsers, ID, Query } from "@/lib/appwrite/server";

export const dynamic = "force-dynamic";

function normalizeEnv(value: string | undefined) {
  return (value ?? "").trim().replace(/^['"]|['"]$/g, "");
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

async function getCurrentAccountEmail() {
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const res = await fetch(getAppwriteRestBase() + "/account", {
    method: "GET",
    headers: {
      cookie: cookieHeader,
      "X-Appwrite-Project": getProjectId(),
      "X-Appwrite-Response-Format": "1.5.0",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

export default async function AdminsPage() {
  const mainAdminEmail = normalizeEnv(process.env.MAIN_ADMIN_EMAIL) || "mohamedaweis.dev@gmail.com";
  const currentEmail = await getCurrentAccountEmail();
  const isMainAdmin = Boolean(currentEmail && currentEmail.toLowerCase() === mainAdminEmail.toLowerCase());

  const databases = getServerDatabases();
  let adminUsersList: any[] = [];
  
  if (isMainAdmin) {
    try {
      const res = await databases.listDocuments("garas_admin", "admin_users");
      adminUsersList = res.documents;
    } catch (error) {
      console.warn("Could not fetch admin users, you might need to run the setup script.", error);
    }
  }

  async function invite(formData: FormData) {
    "use server";

    const email = String(formData.get("email") || "").trim();
    if (!email) {
      return;
    }

    const mainAdminEmail = normalizeEnv(process.env.MAIN_ADMIN_EMAIL) || "mohamedaweis.dev@gmail.com";
    const currentEmail = await getCurrentAccountEmail();
    if (!currentEmail || currentEmail.toLowerCase() !== mainAdminEmail.toLowerCase()) {
      throw new Error("Only the main admin can invite other admins.");
    }

    const usersApi = getServerUsers();
    const dbApi = getServerDatabases();

    try {
      // Find or create user
      const usersRes = await usersApi.list([Query.equal("email", email)]);
      let user = usersRes.users[0];

      if (!user) {
        const randomPassword = ID.unique() + ID.unique();
        user = await usersApi.create(ID.unique(), email, undefined, randomPassword, "Admin User");
      }

      // Check if already in admin_users
      const adminUsersRes = await dbApi.listDocuments("garas_admin", "admin_users", [
        Query.equal("email", email)
      ]);

      if (adminUsersRes.total === 0) {
        // Insert into admin_users collection
        await dbApi.createDocument(
          "garas_admin",
          "admin_users",
          ID.unique(),
          {
            userId: user.$id,
            email: user.email,
            role: "admin",
          }
        );
      }
    } catch (error: any) {
      if (error instanceof AppwriteException) {
        throw new Error(error.message);
      }
      throw error;
    }

    revalidatePath("/dashboard/admins");
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">Admins</h1>
        <p className="mt-1 text-sm text-muted-foreground">Only the main admin can manage other admins.</p>
      </header>

      {!isMainAdmin ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Access denied. Sign in as the main admin to manage admins.</p>
        </section>
      ) : (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <form action={invite} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Invite admin by email</Label>
                <Input id="email" name="email" type="email" placeholder="new-admin@example.com" required />
                <p className="text-xs text-muted-foreground">This creates the user if they don't exist and grants them admin access.</p>
              </div>

              <Button type="submit" className="h-10">Grant admin access</Button>
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold mb-4">Current Admins</h2>
            {adminUsersList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No admin users found.</p>
            ) : (
              <div className="space-y-2">
                {adminUsersList.map((adminDoc) => (
                  <div key={adminDoc.$id} className="flex flex-col p-3 rounded-md bg-muted/50 border border-border/50">
                    <span className="font-medium">{adminDoc.email}</span>
                    <span className="text-xs text-muted-foreground">Role: {adminDoc.role} | ID: {adminDoc.userId}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
