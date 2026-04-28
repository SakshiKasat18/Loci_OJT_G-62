import { NativeModules, Platform } from "react-native";

const { WifiScanner } = NativeModules;

if (!WifiScanner) {
  console.warn(
    "[wifiScanner] Native WifiScanner module is unavailable (Expo Go / unsupported platform). " +
    "WiFi scanning will return empty results."
  );
}

export interface WifiNetwork {
  SSID: string;
  BSSID: string;
  level: number;
}

export async function scanWifi(): Promise<WifiNetwork[]> {
  if (!WifiScanner || typeof WifiScanner.scanWifi !== "function") {
    return [];
  }
  try {
    const results = await WifiScanner.scanWifi();
    return Array.isArray(results) ? results : [];
  } catch (err) {
    console.warn("[wifiScanner] scanWifi failed:", err);
    return [];
  }
}