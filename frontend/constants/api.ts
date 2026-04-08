import Constants from "expo-constants";

function getApiBaseUrl(): string {
  // 1. Highest priority: env variable (set when using ngrok or any fixed URL)
  //    Usage: EXPO_PUBLIC_API_URL=https://xxx.ngrok-free.app npx expo start
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // 2. Auto-derive from Metro host (works when phone and laptop are on same LAN)
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.manifest as any)?.debuggerHost ??
    "";
  const host = hostUri.split(":")[0];
  if (host) return `http://${host}:8080`;

  // 3. Last fallback
  return "http://localhost:8080";
}

export const API_BASE_URL = getApiBaseUrl();
console.log("[LOCI] API_BASE_URL →", API_BASE_URL);
