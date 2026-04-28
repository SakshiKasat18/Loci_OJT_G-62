import { View, Button, Text, ScrollView, Alert, TextInput } from "react-native";
import { useState, useEffect } from "react";
import * as Clipboard from "expo-clipboard";
import { scanWifi } from "../services/wifiScanner";
import { matchZone, resetMatcher } from "../services/zoneMatcher";
import { fetchZones } from "../services/fetchZones";
import { testFirestore } from "../services/testFirestore";
import { spatialOrchestrator } from "../services/spatialOrchestrator";
import { startIMU, stopIMU } from "../services/imuTracker";
import { speechEngine } from "../core/SpeechEngine";

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
// 🔥 Stable Scan (averages multiple scans)
// -------------------------------
async function getStableScan(): Promise<AccessPoint[]> {
  const scans: AccessPoint[][] = [];

  for (let i = 0; i < 4; i++) {
    const res = await scanWifi();
    scans.push(res);
    await new Promise((r) => setTimeout(r, 800));
  }

  const apMap: Record<string, { total: number; count: number }> = {};

  scans.forEach((scan) => {
    scan.forEach((ap) => {
      if (!apMap[ap.BSSID]) {
        apMap[ap.BSSID] = { total: 0, count: 0 };
      }
      apMap[ap.BSSID].total += ap.level;
      apMap[ap.BSSID].count++;
    });
  });

  return Object.entries(apMap).map(([BSSID, data]) => ({
    BSSID,
    level: data.total / data.count,
  }));
}

// -------------------------------
// Component
// -------------------------------
export default function Test() {
  const [logs, setLogs] = useState<string[]>([]);
  const [zoneLabel, setZoneLabel] = useState<string>("");

  const [detected, setDetected] = useState<{
    zone: string | null;
    confidence: number;
  } | null>(null);

  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneMap, setZoneMap] = useState<ZoneMap>({});

  const [autoScanning, setAutoScanning] = useState<boolean>(false);
  const [orchData, setOrchData] = useState<any>(null);

  // -------------------------------
  // Load zones
  // -------------------------------
  useEffect(() => {
    async function load() {
      await testFirestore();

      const data: Zone[] = await fetchZones();
      setZones(data);

      const map: ZoneMap = {};
      data.forEach((z) => {
        if (z.fingerprint) {
          map[z.name] = z.fingerprint;
        }
      });

      setZoneMap(map);
    }

    load();

    // Start services for testing
    startIMU();
    speechEngine.init();
    spatialOrchestrator.start();

    const timer = setInterval(() => {
      setOrchData(spatialOrchestrator.getData());
    }, 1000);

    return () => {
      stopIMU();
      speechEngine.destroy();
      spatialOrchestrator.stop();
      clearInterval(timer);
    };
  }, []);

  // -------------------------------
  // 🔥 Auto Scan Loop (FIXED)
  // -------------------------------
  useEffect(() => {
    if (!autoScanning) return;

    const interval = setInterval(async () => {
      try {
        // 🔥 USE STABLE SCAN
        const res: AccessPoint[] = await getStableScan();

        const filtered = res.filter((ap) => ap.level > -80);

        console.log("📡 AP count:", filtered.length);

        const result = matchZone(filtered, zoneMap);

        console.log("📍 RESULT:", result);

        setDetected({
          zone: result.zone,
          confidence: result.confidence,
        });
      } catch (e) {
        console.log("Auto scan error:", e);
      }
    }, 3000); // 🔥 slower, more stable

    return () => clearInterval(interval);
  }, [autoScanning, zoneMap]);

  // -------------------------------
  // Manual Scan
  // -------------------------------
  const handleScan = async () => {
    const res: AccessPoint[] = await getStableScan();

    const filtered = res.filter((ap) => ap.level > -80);

    console.log("📡 AP count:", filtered.length);

    const result = matchZone(filtered, zoneMap);

    console.log("📍 RESULT:", result);

    setDetected({
      zone: result.zone,
      confidence: result.confidence,
    });

    const formatted = JSON.stringify(res, null, 2);
    setLogs((prev) => [...prev, formatted]);
  };

  // -------------------------------
  // Copy Logs
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
  // Clear Logs
  // -------------------------------
  const handleClear = () => {
    setLogs([]);
    setDetected(null);
  };

  // -------------------------------
  // 🔥 Manual Reset (IMPORTANT)
  // -------------------------------
  const handleReset = () => {
    resetMatcher(); // 🔥 THIS is the real reset
    setDetected(null);
  };

  // -------------------------------
  // UI
  // -------------------------------
  return (
    <View style={{ flex: 1, padding: 20 }}>
      <TextInput
        placeholder="Type zone name before scanning"
        value={zoneLabel}
        onChangeText={setZoneLabel}
        style={{
          borderWidth: 1,
          borderColor: "#aaa",
          borderRadius: 6,
          padding: 8,
          marginBottom: 10,
          fontSize: 14,
        }}
      />

      <Button title="Scan WiFi" onPress={handleScan} />

      <View style={{ height: 10 }} />

      <Button
        title={autoScanning ? "⏹ Stop Auto Scan" : "▶ Start Auto Scan"}
        onPress={() => setAutoScanning((prev) => !prev)}
        color={autoScanning ? "#c0392b" : "#27ae60"}
      />

      <View style={{ height: 10 }} />

      <Button title="🔄 Reset Position" onPress={handleReset} />

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

      {/* Orchestrator Logs */}
      {orchData && (
        <View style={{ marginTop: 20, padding: 15, backgroundColor: "#f0f0f0", borderRadius: 8 }}>
          <Text style={{ fontWeight: "bold", marginBottom: 5 }}>🧠 Spatial Orchestrator</Text>
          <Text>State: {orchData.currentState}</Text>
          <Text>Zone: {orchData.currentZone || "—"}</Text>
          <Text>Confidence: {orchData.confidence}</Text>
          <Text>GPS Accuracy: {orchData.gpsAccuracy.toFixed(1)}m</Text>
          <Text>WiFi Count: {orchData.wifiCount}</Text>
          <Text>Avg RSSI: {orchData.avgRSSI.toFixed(1)}</Text>
          <Text>Is Walking: {orchData.isWalking ? "✅ YES" : "❌ NO"}</Text>
          
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Button title="YES" onPress={() => spatialOrchestrator.handleResponse(true)} />
              <Button title="NO" onPress={() => spatialOrchestrator.handleResponse(false)} />
          </View>
        </View>
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