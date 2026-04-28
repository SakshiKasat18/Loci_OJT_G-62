import Constants from "expo-constants";

function getApiBaseUrl(): string {
  // Hardcoded for reliable APK testing via ngrok
  return "https://natantly-oaten-emerald.ngrok-free.dev";
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
