import { Client, Databases, Users, Teams, ID, Query } from "node-appwrite";
import { appwriteConfig, isAppwriteConfigured } from "@/lib/appwrite/config";

let serverClientInstance: Client | null = null;
let serverDatabasesInstance: Databases | null = null;
let serverUsersInstance: Users | null = null;
let serverTeamsInstance: Teams | null = null;

function normalizeEnvValue(value: string | undefined) {
  return (value ?? "").trim();
}

export function hasAppwriteServerKey() {
  return Boolean(normalizeEnvValue(process.env.APPWRITE_API_KEY));
}

function getServerClient() {
  if (!isAppwriteConfigured()) {
    throw new Error("Appwrite client config missing.");
  }

  const apiKey = normalizeEnvValue(process.env.APPWRITE_API_KEY);
  if (!apiKey) {
    throw new Error("APPWRITE_API_KEY missing.");
  }

  if (!serverClientInstance) {
    serverClientInstance = new Client().setEndpoint(appwriteConfig.endpoint).setProject(appwriteConfig.projectId).setKey(apiKey);
  }

  return serverClientInstance;
}

export function getServerDatabases() {
  if (!serverDatabasesInstance) {
    serverDatabasesInstance = new Databases(getServerClient());
  }

  return serverDatabasesInstance;
}

export function getServerUsers() {
  if (!serverUsersInstance) {
    serverUsersInstance = new Users(getServerClient());
  }

  return serverUsersInstance;
}

export function getServerTeams() {
  if (!serverTeamsInstance) {
    serverTeamsInstance = new Teams(getServerClient());
  }

  return serverTeamsInstance;
}

export { ID, Query };
