import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useEffect, useState } from "react";
import { router } from "expo-router";
import { API_BASE_URL } from "../constants/api";
import { getToken, clearToken } from "../constants/auth";

type Pack = {
  pack_id: string;
  version: string;
  name: string;
  created_at: string;
};

export default function Packs() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchPacks() {
    setError(null);
    try {
      const token = await getToken();

      if (!token) {
        router.replace("/login");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/packs`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.status === 401) {
        await clearToken();
        router.replace("/login");
        return;
      }

      if (!res.ok) {
        setError("Failed to load packs.");
        return;
      }

      const data = await res.json();
      setPacks(data);
    } catch {
      setError("Network error. Check your connection.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchPacks();
  }, []);

  async function handleLogout() {
    await clearToken();
    router.replace("/login");
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Location Packs</Text>
        <Pressable onPress={handleLogout}>
          <Text style={styles.logout}>Logout</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={packs}
        keyExtractor={(item) => `${item.pack_id}-${item.version}`}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchPacks();
            }}
          />
        }
        ListEmptyComponent={
          !error ? (
            <Text style={styles.empty}>No location packs available.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.cardMeta}>
              {item.pack_id} · v{item.version}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
  },
  logout: {
    color: "#888",
    fontSize: 14,
  },
  error: {
    color: "#c0392b",
    marginBottom: 12,
    fontSize: 14,
  },
  empty: {
    color: "#aaa",
    textAlign: "center",
    marginTop: 48,
    fontSize: 14,
  },
  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardName: {
    fontSize: 16,
    fontWeight: "500",
  },
  cardMeta: {
    color: "#888",
    marginTop: 4,
    fontSize: 13,
  },
});