import Constants from "expo-constants";

// Dynamically derive the backend host from Metro's known host IP.
// Supports both old (manifest.debuggerHost) and new (expoConfig.hostUri) Expo SDK formats.
function getApiBaseUrl(): string {
  const hostUri =
    Constants.expoConfig?.hostUri ??        // SDK 49+
    (Constants.manifest as any)?.debuggerHost ?? // SDK <49
    "";

  const host = hostUri.split(":")[0];
  const url = host ? `http://${host}:8080` : "http://localhost:8080";

  console.log("[LOCI] API_BASE_URL →", url, " | raw hostUri:", hostUri);
  return url;
}

export const API_BASE_URL = getApiBaseUrl();
