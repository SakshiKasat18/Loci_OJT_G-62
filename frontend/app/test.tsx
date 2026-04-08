import { View, Button, Text, ScrollView, Alert } from "react-native";
import { useState, useEffect } from "react";
import * as Clipboard from "expo-clipboard";
import { scanWifi } from "../services/wifiScanner";
import { matchZone } from "../services/zoneMatcher";
import { fetchZones } from "../services/fetchZones";
import { testFirestore } from "../services/testFirestore";

// -------------------------------
// Types
// -------------------------------
type AccessPoint = {
  BSSID: string;
  level: number;
};

type Zone = {
  name: string;
  fingerprint: Record<string, number>;
};

type ZoneMap = {
  [zoneName: string]: Record<string, number>;
};

// -------------------------------
// Component
// -------------------------------
export default function Test() {
  const [logs, setLogs] = useState<string[]>([]);
  const [detected, setDetected] = useState<{
    zone: string | null;
    confidence: number;
  } | null>(null);

  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneMap, setZoneMap] = useState<ZoneMap>({});

  // -------------------------------
  // Load zones from Firebase
  // -------------------------------
  useEffect(() => {
    async function load() {
      await testFirestore(); // optional debug

      const data: Zone[] = await fetchZones();

      console.log("Zones from Firebase:", data);

      setZones(data);

      // 🔥 Convert to ZoneMap once
      const map: ZoneMap = {};
      data.forEach((z) => {
        if (z.fingerprint) {
          map[z.name] = z.fingerprint;
        }
      });

      setZoneMap(map);
    }

    load();
  }, []);

  // -------------------------------
  // Scan handler
  // -------------------------------
  const handleScan = async () => {
    const res: AccessPoint[] = await scanWifi();

    // Filter weak signals
    const filtered = res.filter((ap) => ap.level > -75);

    // 🔥 CORE MATCHING
    const result = matchZone(filtered, zoneMap);

    setDetected(result);

    console.log("Detected zone:", result);
    console.log("Filtered scan:", filtered);
    console.log("ZoneMap:", zoneMap);

    // Debug: fingerprint sizes
    Object.keys(zoneMap).forEach((zoneName) => {
      console.log(
        "Zone:",
        zoneName,
        Object.keys(zoneMap[zoneName]).length
      );
    });

    // Store logs
    const formatted = JSON.stringify(res, null, 2);
    setLogs((prev) => [...prev, formatted]);
  };

  // -------------------------------
  // Copy logs
  // -------------------------------
  const handleCopy = async () => {
    if (logs.length === 0) {
      Alert.alert("Nothing to copy");
      return;
    }

    const combined = logs
      .map((log, i) => `Scan ${i + 1}:\n${log}`)
      .join("\n\n");

    await Clipboard.setStringAsync(combined);
    Alert.alert("Copied to clipboard ✅");
  };

  // -------------------------------
  // Clear logs
  // -------------------------------
  const handleClear = () => {
    setLogs([]);
    setDetected(null);
  };

  // -------------------------------
  // UI
  // -------------------------------
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Button title="Scan WiFi" onPress={handleScan} />

      <View style={{ height: 10 }} />

      <Button title="Copy All Scans" onPress={handleCopy} />

      <View style={{ height: 10 }} />

      <Button title="Clear Logs" onPress={handleClear} />

      {/* Detected Zone */}
      {detected && (
        <Text style={{ marginTop: 20, fontWeight: "bold" }}>
          Zone: {detected.zone ?? "None"} | Confidence:{" "}
          {detected.confidence}
        </Text>
      )}

      {/* Logs */}
      <ScrollView style={{ marginTop: 20 }}>
        {logs.map((log, i) => (
          <Text key={i} style={{ marginBottom: 15 }}>
            {`Scan ${i + 1}:\n${log}`}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}