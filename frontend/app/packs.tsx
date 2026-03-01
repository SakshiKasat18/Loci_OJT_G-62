import { View, Text, FlatList, ActivityIndicator, Alert, RefreshControl } from "react-native";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "../constants/api";
import { getToken } from "../constants/auth";

export default function Packs() {
  const [packs, setPacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function fetchPacks() {
    try {
      const token = await getToken();
      if (!token) throw new Error("No token");

      const res = await fetch(`${API_BASE_URL}/packs`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      setPacks(data);
    } catch (err) {
      Alert.alert("Error", "Failed to load packs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchPacks();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "600", marginBottom: 16 }}>
        Location Packs
      </Text>

      <FlatList
        data={packs}
        keyExtractor={(item) => item.pack_id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => {
            setRefreshing(true);
            fetchPacks();
          }} />
        }
        renderItem={({ item }) => (
          <View
            style={{
              borderWidth: 1,
              borderColor: "#eee",
              borderRadius: 12,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "500" }}>
              {item.name}
            </Text>
            <Text style={{ color: "#666", marginTop: 4 }}>
              ID: {item.pack_id} · v{item.version}
            </Text>
          </View>
        )}
      />
    </View>
  );
}