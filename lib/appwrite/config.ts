function normalizeEnvValue(value: string | undefined) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();

  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export const appwriteConfig = {
  endpoint: normalizeEnvValue(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT),
  projectId: normalizeEnvValue(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID),
  databaseId: normalizeEnvValue(process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID) || "garas_main",
  conversationsCollectionId:
    normalizeEnvValue(process.env.NEXT_PUBLIC_APPWRITE_CONVERSATIONS_COLLECTION_ID) || "conversations",
  messagesCollectionId: normalizeEnvValue(process.env.NEXT_PUBLIC_APPWRITE_MESSAGES_COLLECTION_ID) || "messages",
};

export function isAppwriteConfigured() {
  return Boolean(appwriteConfig.endpoint && appwriteConfig.projectId);
}

export function getAppwriteConfigError() {
  return "Add NEXT_PUBLIC_APPWRITE_ENDPOINT and NEXT_PUBLIC_APPWRITE_PROJECT_ID to .env.local.";
}
