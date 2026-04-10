import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { getToken } from "../constants/auth";

export default function Index() {
  useEffect(() => {
    async function checkAuth() {
      const token = await getToken();
      if (token) {
        router.replace("/guide");
      } else {
        router.replace("/login");
      }
    }
    checkAuth();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator />
    </View>
  );
}