import { NativeModules } from "react-native";

const { WifiScanner } = NativeModules;

export async function scanWifi() {
  return await WifiScanner.scanWifi();
}