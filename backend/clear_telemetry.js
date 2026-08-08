import { db, rtdb } from './firebase.config.js';
import { getDocs, collection, deleteDoc, doc } from 'firebase/firestore';
import { ref, set } from 'firebase/database';

async function clearAllTelemetry() {
  console.log("🔥 Starting deletion of all vehicle telemetry data from Firebase Cloud Database (ibots-gps)...");

  // 1. Delete all Firestore documents under 'telemetry' collection
  try {
    const snapshot = await getDocs(collection(db, 'telemetry'));
    console.log(`Found ${snapshot.size} telemetry documents in Firestore 'telemetry' collection.`);
    for (const docSnap of snapshot.docs) {
      await deleteDoc(doc(db, 'telemetry', docSnap.id));
      console.log(`🗑️ Deleted Firestore telemetry document: ${docSnap.id}`);
    }
  } catch (fsErr) {
    console.warn("⚠️ Firestore delete warning:", fsErr.message);
  }

  // 2. Clear Realtime Database (RTDB) node 'telemetry'
  try {
    if (rtdb) {
      await set(ref(rtdb, 'telemetry'), null);
      console.log(`🗑️ Cleared Firebase Realtime Database (RTDB) 'telemetry' node`);
    }
  } catch (rtdbErr) {
    console.warn("⚠️ RTDB clear warning:", rtdbErr.message);
  }

  console.log("🎉 All vehicle telemetry data deleted successfully from Firebase!");
  process.exit(0);
}

clearAllTelemetry().catch(err => {
  console.error("❌ Deletion error:", err);
  process.exit(1);
});
