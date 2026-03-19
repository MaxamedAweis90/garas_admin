import { Button } from "@/components/ui/button";
import { getServerUsers } from "@/lib/appwrite/server";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

type AppwriteUser = {
  $id: string;
  name?: string;
  email?: string;
  status?: boolean;
  registration?: string;
};

export default async function UserManagementPage() {
  const usersApi = getServerUsers();
  const result = await usersApi.list();
  const users = (result.users as unknown as AppwriteUser[]) ?? [];

  async function setStatus(formData: FormData) {
    "use server";
    const userId = String(formData.get("userId") || "").trim();
    const nextStatus = String(formData.get("status") || "").trim() === "true";
    if (!userId) {
      return;
    }

    const usersApi = getServerUsers();
    await usersApi.updateStatus(userId, nextStatus);
    revalidatePath("/dashboard/users");
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border bg-card p-5">
        <h1 className="text-lg font-semibold">User Management</h1>
        <p className="mt-1 text-sm text-muted-foreground">List all Appwrite users and ban/unban accounts.</p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="chat-scrollbar-soft overflow-x-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Registered</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const active = user.status !== false;
                return (
                  <tr key={user.$id} className="border-t border-border">
                    <td className="px-4 py-3">{user.name || "—"}</td>
                    <td className="px-4 py-3">{user.email || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={active ? "text-emerald-300" : "text-rose-300"}>{active ? "Active" : "Banned"}</span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.registration ? new Date(user.registration).toLocaleString() : "—"}</td>
                    <td className="px-4 py-3">
                      <form action={setStatus}>
                        <input type="hidden" name="userId" value={user.$id} />
                        <input type="hidden" name="status" value={active ? "false" : "true"} />
                        <Button size="sm" variant={active ? "destructive" : "secondary"}>
                          {active ? "Ban" : "Unban"}
                        </Button>
                      </form>
                    </td>
                  </tr>
                );
              })}

              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
