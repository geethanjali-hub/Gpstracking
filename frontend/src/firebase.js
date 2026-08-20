import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, onSnapshot } from 'firebase/firestore';
import { getDatabase, ref, onValue } from 'firebase/database';

// Firebase Client Configuration
export const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || "AIzaSyBaXUZa6EhZHJIUmFO586sSma2wnKrIpmQ",
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "ibots-gps.firebaseapp.com",
  databaseURL: import.meta.env?.VITE_FIREBASE_DATABASE_URL || "https://ibots-gps-default-rtdb.firebaseio.com",
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || "ibots-gps",
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || "ibots-gps.appspot.com",
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "547940130341",
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || "1:547940130341:web:ce76e43c84c455da52e9cc"
};

// Initialize Firebase App, Firestore & Realtime Database
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app);
export const rtdb = getDatabase(app);

/**
 * Subscribe to Real-Time Telemetry updates from Firebase (Firestore / RTDB)
 */
export function subscribeToTelemetry(onUpdate) {
  try {
    // 1. Try Realtime Database (RTDB) listener
    const rtdbRef = ref(rtdb, 'telemetry');
    const unsubRtdb = onValue(rtdbRef, (snapshot) => {
      if (snapshot.exists()) {
        onUpdate(snapshot.val());
      }
    }, (error) => {
      console.warn("RTDB listener fallback:", error.message);
    });

    // 2. Try Firestore listener
    const unsubFs = onSnapshot(collection(db, 'telemetry'), (snapshot) => {
      const liveData = {};
      snapshot.forEach((doc) => {
        liveData[doc.id] = doc.data();
      });
      if (Object.keys(liveData).length > 0) {
        onUpdate(liveData);
      }
    }, (error) => {
      console.warn("Firestore listener fallback:", error.message);
    });

    return () => {
      unsubRtdb();
      unsubFs();
    };
  } catch (err) {
    console.warn("Firebase client offline:", err.message);
    return () => {};
  }
}

/**
 * Subscribe to Fleet Vehicles directly from Firebase Firestore ('vehicles')
 */
export function subscribeToVehicles(onUpdate) {
  try {
    return onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      const vehicleList = [];
      snapshot.forEach((docSnap) => {
        const vData = docSnap.data();
        if (vData && vData.id) {
          vehicleList.push({
            ...vData,
            name: vData.name || `Tracker (${vData.id})`
          });
        }
      });
      onUpdate(vehicleList);
    }, (error) => {
      console.warn("Firestore vehicles listener warning:", error.message);
    });
  } catch (err) {
    console.warn("Firebase client vehicles listener error:", err.message);
    return () => {};
  }
}

export default db;
