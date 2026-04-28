import { Redirect } from "expo-router";

export default function Index() {
  // Bypassing auth for testing - Redirect is safer than router.replace in useEffect
  return <Redirect href="/guide" />;
}