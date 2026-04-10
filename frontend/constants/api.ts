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

/**
 * apiFetch — drop-in replacement for fetch() that automatically injects headers
 * required for ngrok tunnels (ngrok-skip-browser-warning) and any auth token.
 *
 * Use this everywhere instead of raw fetch() — it works identically on LAN too.
 *
 * Usage:
 *   const res = await apiFetch("/auth/login", { method: "POST", body: ... });
 *   const res = await apiFetch("/packs", { token });
 */
export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<Response> {
  const { token, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Bypass ngrok's browser-warning interstitial page — safe, has no effect on non-ngrok URLs
    "ngrok-skip-browser-warning": "true",
    ...(extraHeaders as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  return fetch(`${API_BASE_URL}${path}`, { ...rest, headers });
}
