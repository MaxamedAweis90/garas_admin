import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Databases, ID, IndexType } from "node-appwrite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).trim();
    }

    values[key] = value;
  }

  return values;
}

const localEnv = parseEnvFile(path.join(projectRoot, ".env.local"));

const endpoint = localEnv.NEXT_PUBLIC_APPWRITE_ENDPOINT;
const projectId = localEnv.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = localEnv.APPWRITE_API_KEY;

const adminDatabaseId = localEnv.APPWRITE_ADMIN_DATABASE_ID || "garas_admin";
const adminDatabaseName = localEnv.APPWRITE_ADMIN_DATABASE_NAME || "GARAS Admin Database";

const collections = {
  adminLogs: { id: localEnv.APPWRITE_ADMIN_LOGS_COLLECTION_ID || "admin_logs", name: "Admin_Logs" },
  systemSettings: { id: localEnv.APPWRITE_SYSTEM_SETTINGS_COLLECTION_ID || "system_settings", name: "System_Settings" },
  featureFlags: { id: localEnv.APPWRITE_FEATURE_FLAGS_COLLECTION_ID || "feature_flags", name: "Feature_Flags" },
  adminUsers: { id: localEnv.APPWRITE_ADMIN_USERS_COLLECTION_ID || "admin_users", name: "Admin_Users" },
};

if (!endpoint || !projectId || !apiKey) {
  console.error("Admin setup cannot start.");
  console.error("Ensure .env.local contains:");
  console.error("- NEXT_PUBLIC_APPWRITE_ENDPOINT");
  console.error("- NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  console.error("- APPWRITE_API_KEY");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function withConflictGuard(task, label) {
  try {
    return await task();
  } catch (error) {
    if (error?.code === 409) {
      console.log(`${label}: already exists, skipping.`);
      return null;
    }

    throw error;
  }
}

async function ensureDatabase() {
  await withConflictGuard(() => databases.create(adminDatabaseId, adminDatabaseName, true), `Database ${adminDatabaseId}`);
}

async function ensureCollection(collectionId, name) {
  // Empty permissions => not readable/writeable by normal users.
  await withConflictGuard(
    () => databases.createCollection(adminDatabaseId, collectionId, name, [], true, true),
    `Collection ${collectionId}`
  );
}

async function ensureStringAttribute(collectionId, key, size, required) {
  await withConflictGuard(
    () => databases.createStringAttribute(adminDatabaseId, collectionId, key, size, required),
    `Attribute ${collectionId}.${key}`
  );
}

async function ensureDatetimeAttribute(collectionId, key, required) {
  await withConflictGuard(
    () => databases.createDatetimeAttribute(adminDatabaseId, collectionId, key, required),
    `Attribute ${collectionId}.${key}`
  );
}

async function ensureBooleanAttribute(collectionId, key, required, defaultValue = undefined) {
  await withConflictGuard(
    () => databases.createBooleanAttribute(adminDatabaseId, collectionId, key, required, defaultValue),
    `Attribute ${collectionId}.${key}`
  );
}

async function waitForAttributes(collectionId, keys) {
  const pending = new Set(keys);

  for (let attempt = 0; attempt < 40; attempt += 1) {
    for (const key of [...pending]) {
      try {
        const attribute = await databases.getAttribute(adminDatabaseId, collectionId, key);
        if (attribute.status === "available") {
          pending.delete(key);
        }
      } catch {
        // Wait for attribute to become visible.
      }
    }

    if (pending.size === 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`Attributes not ready for ${collectionId}: ${[...pending].join(", ")}`);
}

async function ensureIndex(collectionId, key, type, attributes, orders = undefined) {
  await withConflictGuard(
    () => databases.createIndex(adminDatabaseId, collectionId, key, type, attributes, orders),
    `Index ${collectionId}.${key}`
  );
}

async function setupAdminLogs() {
  const { id, name } = collections.adminLogs;
  await ensureCollection(id, name);

  await ensureStringAttribute(id, "actorUserId", 64, false);
  await ensureStringAttribute(id, "action", 128, true);
  // Keep metadata small to stay within Appwrite attribute constraints.
  // Prefer using built-in `$createdAt` for timestamps.
  await ensureStringAttribute(id, "metaJson", 2048, false);

  await waitForAttributes(id, ["actorUserId", "action", "metaJson"]);
}

async function setupSystemSettings() {
  const { id, name } = collections.systemSettings;
  await ensureCollection(id, name);

  await ensureBooleanAttribute(id, "enabled", true);
  await ensureDatetimeAttribute(id, "updatedAt", false);

  await waitForAttributes(id, ["enabled", "updatedAt"]);

  await withConflictGuard(
    () => databases.createDocument(adminDatabaseId, id, "system", { enabled: true }),
    `Document ${id}.system`
  );
}

async function setupFeatureFlags() {
  const { id, name } = collections.featureFlags;
  await ensureCollection(id, name);

  await ensureStringAttribute(id, "key", 128, true);
  await ensureBooleanAttribute(id, "enabled", true);
  await ensureDatetimeAttribute(id, "updatedAt", false);

  await waitForAttributes(id, ["key", "enabled", "updatedAt"]);
  await ensureIndex(id, "feature_flag_key_unique", IndexType.Unique, ["key"]);
}

async function setupAdminUsers() {
  const { id, name } = collections.adminUsers;
  await ensureCollection(id, name);

  await ensureStringAttribute(id, "userId", 64, true);
  await ensureStringAttribute(id, "email", 128, true);
  await ensureStringAttribute(id, "role", 32, true);

  await waitForAttributes(id, ["userId", "email", "role"]);
  await ensureIndex(id, "admin_user_id_unique", IndexType.Unique, ["userId"]);
  await ensureIndex(id, "admin_email_unique", IndexType.Unique, ["email"]);
}

async function main() {
  console.log("GARAS Admin Appwrite setup starting...");
  await ensureDatabase();
  await setupAdminLogs();
  await setupSystemSettings();
  await setupFeatureFlags();
  await setupAdminUsers();

  console.log("\nAdmin setup complete.");
  console.log(`Database: ${adminDatabaseId}`);
  console.log(`Collections: ${collections.adminLogs.id}, ${collections.systemSettings.id}, ${collections.featureFlags.id}, ${collections.adminUsers.id}`);
}

main().catch((error) => {
  console.error("Admin setup failed.");
  console.error(error?.message ?? error);
  process.exit(1);
});
