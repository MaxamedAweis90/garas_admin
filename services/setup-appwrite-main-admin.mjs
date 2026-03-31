import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppwriteException, Client, ID, Query, Databases, Users } from "node-appwrite";

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
const mainAdminEmail = localEnv.MAIN_ADMIN_EMAIL;
const mainAdminPassword = localEnv.MAIN_ADMIN_PASSWORD;

if (!endpoint || !projectId || !apiKey) {
  console.error("Main admin setup cannot start.");
  console.error("Ensure .env.local contains:");
  console.error("- NEXT_PUBLIC_APPWRITE_ENDPOINT");
  console.error("- NEXT_PUBLIC_APPWRITE_PROJECT_ID");
  console.error("- APPWRITE_API_KEY");
  process.exit(1);
}

function normalizeEndpoint(value) {
  const trimmed = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) {
    return trimmed;
  }
  return trimmed.endsWith("/v1") ? trimmed : trimmed.replace(/\/+$/, "") + "/v1";
}

if (!mainAdminEmail || !mainAdminPassword) {
  console.error("Missing MAIN_ADMIN_EMAIL or MAIN_ADMIN_PASSWORD in .env.local");
  process.exit(1);
}

const client = new Client().setEndpoint(normalizeEndpoint(endpoint)).setProject(projectId).setKey(apiKey);
const users = new Users(client);
const databases = new Databases(client);

const adminDatabaseId = localEnv.APPWRITE_ADMIN_DATABASE_ID || "garas_admin";
const adminUsersCollectionId = localEnv.APPWRITE_ADMIN_USERS_COLLECTION_ID || "admin_users";

async function findOrCreateUserIdByEmail(email) {
  const existing = await users.list([Query.equal("email", [email])]);
  const user = existing.users[0] ?? null;
  if (user) {
    return user.$id;
  }

  const created = await users.create(ID.unique(), email, undefined, mainAdminPassword, "Main Admin");
  return created.$id;
}

async function ensureAdminUserRecord(userId, email) {
  try {
    const existing = await databases.listDocuments(adminDatabaseId, adminUsersCollectionId, [
      Query.equal("userId", [userId])
    ]);
    
    if (existing.documents.length > 0) {
      console.log("Main admin is already in the admin_users collection.");
      return;
    }

    await databases.createDocument(adminDatabaseId, adminUsersCollectionId, ID.unique(), {
      userId: userId,
      email: email,
      role: "main_admin"
    });
    console.log("Added main admin to admin_users collection.");
  } catch (error) {
    if (error?.code === 404) {
      console.error("Collection 'admin_users' not found. Please run 'npm run setup:admin' first.");
      throw error;
    }
    throw error;
  }
}

async function main() {
  console.log("GARAS main admin setup starting...");

  const userId = await findOrCreateUserIdByEmail(mainAdminEmail);
  await ensureAdminUserRecord(userId, mainAdminEmail);

  console.log("\nMain admin setup complete.");
  console.log(`Main admin userId: ${userId}`);
}

main().catch((error) => {
  console.error("Main admin setup failed.");

  if (error instanceof AppwriteException) {
    console.error(`AppwriteException: ${error.message}`);
    console.error(`Code: ${error.code}`);
    console.error(`Type: ${error.type}`);
    if (error.response) {
      const responseText = typeof error.response === "string" ? error.response : JSON.stringify(error.response);
      console.error(`Response: ${responseText.slice(0, 800)}`);
    }
  } else {
    console.error(error?.message ?? error);
  }

  process.exit(1);
});
