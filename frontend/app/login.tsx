import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { useState } from "react";
import { router } from "expo-router";
import { API_BASE_URL } from "../constants/api";
import { saveToken } from "../constants/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
  try {
    Alert.alert("Step 1", "Starting request");
    setLoading(true);

    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    Alert.alert("Step 2", `Status: ${res.status}`);

    const data = await res.json();
    Alert.alert("Step 3", JSON.stringify(data));

  } catch (e: any) {
    Alert.alert("Fetch error", e.message || "Unknown error");
  } finally {
    setLoading(false);
  }
}

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
      <Text style={{ fontSize: 32, fontWeight: "600", marginBottom: 8 }}>
        Loci
      </Text>

      <Text style={{ color: "#666", marginBottom: 32 }}>
        Sign in to continue
      </Text>

      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 14,
          marginBottom: 12,
        }}
      />

      <TextInput
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 14,
          marginBottom: 20,
        }}
      />

      <Pressable
        onPress={handleLogin}
        style={{
          backgroundColor: "black",
          padding: 16,
          borderRadius: 10,
          alignItems: "center",
        }}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: "white", fontWeight: "600" }}>
            Login
          </Text>
        )}
      </Pressable>
    </View>
  );
}