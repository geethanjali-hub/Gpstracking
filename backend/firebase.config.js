import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getAuth } from 'firebase/auth';

// Firebase Project Credentials
export const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyBaXUZa6EhZHJIUmFO586sSma2wnKrIpmQ",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "ibots-gps.firebaseapp.com",
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL || "https://ibots-gps-default-rtdb.firebaseio.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "ibots-gps",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "ibots-gps.appspot.com",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "547940130341",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:547940130341:web:ce76e43c84c455da52e9cc"
};

// Initialize Firebase App, Firestore, Realtime DB & Auth
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(firebaseApp);
export const rtdb = getDatabase(firebaseApp);
export const auth = getAuth(firebaseApp);

export default db;
