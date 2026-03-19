import { getServerDatabases } from "@/lib/appwrite/server";

const ADMIN_DATABASE_ID = "garas_admin";

const COLLECTIONS = {
  adminLogs: { id: "admin_logs", name: "Admin_Logs" },
  systemSettings: { id: "system_settings", name: "System_Settings" },
  featureFlags: { id: "feature_flags", name: "Feature_Flags" },
} as const;

async function withConflictGuard<T>(task: () => Promise<T>, ignoreCodes: number[] = [409, 400]) {
  try {
    return await task();
  } catch (error: any) {
    if (ignoreCodes.includes(error?.code)) {
      return null;
    }
    throw error;
  }
}

export async function ensureAdminStorage() {
  const databases = getServerDatabases();

  await withConflictGuard(() => databases.create(ADMIN_DATABASE_ID, "GARAS Admin Database", true), [409]);

  // Collections (kept extremely small; permissions are left to Appwrite Console / API key usage).
  await withConflictGuard(() =>
    databases.createCollection(ADMIN_DATABASE_ID, COLLECTIONS.adminLogs.id, COLLECTIONS.adminLogs.name, [], true, true)
  );
  await withConflictGuard(() =>
    databases.createCollection(ADMIN_DATABASE_ID, COLLECTIONS.systemSettings.id, COLLECTIONS.systemSettings.name, [], true, true)
  );
  await withConflictGuard(() =>
    databases.createCollection(ADMIN_DATABASE_ID, COLLECTIONS.featureFlags.id, COLLECTIONS.featureFlags.name, [], true, true)
  );

  // Minimal attributes for system settings and feature flags.
  await withConflictGuard(() =>
    databases.createBooleanAttribute(ADMIN_DATABASE_ID, COLLECTIONS.systemSettings.id, "enabled", true)
  );
  await withConflictGuard(() =>
    databases.createStringAttribute(ADMIN_DATABASE_ID, COLLECTIONS.featureFlags.id, "key", 128, true)
  );
  await withConflictGuard(() =>
    databases.createBooleanAttribute(ADMIN_DATABASE_ID, COLLECTIONS.featureFlags.id, "enabled", true)
  );

  // Ensure a single settings doc.
  await withConflictGuard(() =>
    databases.createDocument(ADMIN_DATABASE_ID, COLLECTIONS.systemSettings.id, "system", { enabled: true })
  );

  return {
    adminDatabaseId: ADMIN_DATABASE_ID,
    collections: COLLECTIONS,
  };
}

export async function getSystemStatus() {
  const databases = getServerDatabases();
  await ensureAdminStorage();
  const doc = await databases.getDocument(ADMIN_DATABASE_ID, COLLECTIONS.systemSettings.id, "system");
  return Boolean((doc as any).enabled);
}

export async function setSystemStatus(enabled: boolean) {
  const databases = getServerDatabases();
  await ensureAdminStorage();
  await databases.updateDocument(ADMIN_DATABASE_ID, COLLECTIONS.systemSettings.id, "system", { enabled });
}
