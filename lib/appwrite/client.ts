import { Account, Client, ID } from "appwrite";
import { appwriteConfig, getAppwriteConfigError, isAppwriteConfigured } from "@/lib/appwrite/config";

export { appwriteConfig, getAppwriteConfigError, isAppwriteConfigured } from "@/lib/appwrite/config";

let clientInstance: Client | null = null;
let accountInstance: Account | null = null;

function getClient() {
  if (!isAppwriteConfigured()) {
    throw new Error(getAppwriteConfigError());
  }

  if (!clientInstance) {
    clientInstance = new Client().setEndpoint(appwriteConfig.endpoint).setProject(appwriteConfig.projectId);
  }

  return clientInstance;
}

export function getAccount() {
  if (!accountInstance) {
    accountInstance = new Account(getClient());
  }

  return accountInstance;
}

export { ID };
