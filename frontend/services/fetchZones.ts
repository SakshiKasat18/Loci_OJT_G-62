import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";
import { ZONES as wifiFingerprints } from "../data/zones";

export async function fetchZones() {
  const snapshot = await getDocs(collection(db, "zones"));

  const zones = snapshot.docs.map(doc => {
    const data = doc.data();

    return {
      id: doc.id,
      name: data.name,
      floorId: data.floorId,
      shapeType: data.shapeType,
      geometry: data.geometry,

      fingerprint: wifiFingerprints[data.name] || null,
      neighbors: data.neighbors || []
    };
  });

  // ✅ DEBUG (AFTER zones is created)
  zones.forEach(z => {
    console.log(z.name, "→", z.fingerprint ? "✅" : "❌");
  });

  return zones;
}