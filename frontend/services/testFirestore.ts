import { db } from "./firebase";
import { collection, getDocs } from "firebase/firestore";

export async function testFirestore() {
  try {
    const snapshot = await getDocs(collection(db, "zones"));
    console.log("Docs:", snapshot.docs.length);

    snapshot.forEach(doc => {
      console.log(doc.id, doc.data());
    });

  } catch (error) {
    console.error("Firestore error:", error);
  }
}