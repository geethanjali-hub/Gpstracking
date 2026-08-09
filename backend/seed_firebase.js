import { db } from './firebase.config.js';
import { doc, setDoc, getDocs, collection } from 'firebase/firestore';

const defaultVehicles = [
  {
    id: 'gps-obd-tracker-01',
    name: 'gps v2',
    userName: 'Test driver 1',
    vin: 'OBD_TRK_8750',
    status: 'offline',
    topic: 'sedhupathi/gps-obd-tracker-01/data',
    broker: 'mqtt://test.mosquitto.org:1883',
    routeEnabled: true,
    geofenceEnabled: true,
    deviationThreshold: 300,
    alertSettings: { maxSpeed: 120, maxTemp: 105, minFuel: 15 },
    createdAt: new Date().toISOString()
  },
  {
    id: 'ibots-tracker-1',
    name: 'tracker 1',
    userName: 'gps v1',
    vin: 'OBD_TRK_8007',
    status: 'offline',
    topic: 'ibots/tracker/1/location',
    broker: 'mqtt://test.mosquitto.org:1883',
    routeEnabled: true,
    geofenceEnabled: true,
    deviationThreshold: 300,
    alertSettings: { maxSpeed: 120, maxTemp: 105, minFuel: 15 },
    createdAt: new Date().toISOString()
  }
];

async function seed() {
  console.log("Seeding Firebase Firestore 'vehicles' collection under ibots-gps...");
  for (const v of defaultVehicles) {
    await setDoc(doc(db, 'vehicles', v.id), v);
    console.log(`✅ Seeded ${v.id} (${v.name}) into Firestore collection 'vehicles'`);
  }
  const snapshot = await getDocs(collection(db, 'vehicles'));
  console.log(`🎉 Total documents in Firestore 'vehicles' collection: ${snapshot.size}`);
  process.exit(0);
}

seed().catch(err => {
  console.error("❌ Seeding error:", err);
  process.exit(1);
});
