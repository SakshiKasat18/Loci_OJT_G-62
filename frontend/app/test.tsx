import { View, Button, Text, ScrollView, Alert } from "react-native";
import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import { scanWifi } from "../services/wifiScanner";
import { matchZone } from "../services/zoneMatcher";
import { ZONES } from "../data/zones";

export default function Test() {
  const [logs, setLogs] = useState<string[]>([]);
  const [detected, setDetected] = useState<any>(null);

  const handleScan = async () => {
  const res = await scanWifi();

  // 🔥 Filter weak signals
  const filtered = res.filter((ap) => ap.level > -75);

  // 🔥 Use ONLY filtered data
  const result = matchZone(filtered, ZONES);

  setDetected(result);

  console.log("Detected zone:", result);

  const formatted = JSON.stringify(res, null, 2);
  setLogs((prev) => [...prev, formatted]);
};

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

  const handleClear = () => {
    setLogs([]);
    setDetected(null);
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      
      <Button title="Scan WiFi" onPress={handleScan} />

      <View style={{ height: 10 }} />

      <Button title="Copy All Scans" onPress={handleCopy} />

      <View style={{ height: 10 }} />

      <Button title="Clear Logs" onPress={handleClear} />

      {/* 🔥 Show detected zone */}
      {detected && (
        <Text style={{ marginTop: 20, fontWeight: "bold" }}>
          Zone: {detected.zone} | Score: {detected.score}
        </Text>
      )}

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