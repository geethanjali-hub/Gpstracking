import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from './db.js';
import { Vehicle } from './models/Vehicle.js';
import { TelemetryHistory } from './models/TelemetryHistory.js';
import { User } from './models/User.js';

const seedData = async () => {
  await connectDB();

  console.log("🌱 Seeding MongoDB initial dataset...");

  // Default Vehicles
  const defaultVehicles = [
    {
      id: 'usr-1_v1',
      name: 'GPS V1',
      vin: 'IBOTS-GPS-V1-2026',
      topic: 'ibots/gps/v1',
      broker: 'mqtt://test.mosquitto.org:1883',
      ownerUser: 'admin',
      userName: 'System Administrator',
      status: 'online',
      latestTelemetry: {
        lat: 11.023674,
        lng: 76.942372,
        speed: 42,
        altitude: 412,
        battery: 94,
        engineStatus: true,
        fuelLevel: 78,
        satellites: 12,
        address: 'Saibaba Colony, Coimbatore, Tamil Nadu, PIN: 641011',
        isOnline: true,
        status: 'moving',
        timestamp: new Date()
      }
    },
    {
      id: 'usr-1_v2',
      name: 'GPS v2',
      vin: 'IBOTS-GPS-V2-2026',
      topic: 'ibots/gps/v2',
      broker: 'mqtt://test.mosquitto.org:1883',
      ownerUser: 'admin',
      userName: 'System Administrator',
      status: 'online',
      latestTelemetry: {
        lat: 11.02368,
        lng: 76.94238,
        speed: 0,
        altitude: 410,
        battery: 88,
        engineStatus: false,
        fuelLevel: 65,
        satellites: 10,
        address: 'Saibaba Colony, Coimbatore, Tamil Nadu, PIN: 641011',
        isOnline: true,
        status: 'parked',
        timestamp: new Date()
      }
    },
    {
      id: 'usr-1_v3',
      name: 'gps v3',
      vin: 'IBOTS-GPS-V3-2026',
      topic: 'ibots/gps/v3',
      broker: 'mqtt://test.mosquitto.org:1883',
      ownerUser: 'admin',
      userName: 'System Administrator',
      status: 'online',
      latestTelemetry: {
        lat: 11.023674,
        lng: 76.942372,
        speed: 18,
        altitude: 415,
        battery: 98,
        engineStatus: true,
        fuelLevel: 90,
        satellites: 14,
        address: 'Saibaba Colony, Coimbatore, Tamil Nadu, PIN: 641011',
        isOnline: true,
        status: 'moving',
        timestamp: new Date()
      }
    }
  ];

  for (const v of defaultVehicles) {
    await Vehicle.findOneAndUpdate({ id: v.id }, v, { upsert: true, new: true });
    
    // Seed initial historical telemetry point
    await TelemetryHistory.create({
      vehicleId: v.id,
      lat: v.latestTelemetry.lat,
      lng: v.latestTelemetry.lng,
      speed: v.latestTelemetry.speed,
      altitude: v.latestTelemetry.altitude,
      battery: v.latestTelemetry.battery,
      engineStatus: v.latestTelemetry.engineStatus,
      fuelLevel: v.latestTelemetry.fuelLevel,
      satellites: v.latestTelemetry.satellites,
      address: v.latestTelemetry.address,
      status: v.latestTelemetry.status,
      timestamp: new Date()
    });
  }

  // Default Admin User
  const hashedPassword = await bcrypt.hash('IbotsGPS2026!', 10);
  await User.findOneAndUpdate(
    { username: 'admin' },
    {
      id: 'usr-1',
      username: 'admin',
      password: hashedPassword,
      name: 'System Administrator',
      role: 'admin',
      assignedVehicle: '',
      status: 'Active'
    },
    { upsert: true, new: true }
  );

  console.log("✅ MongoDB Seeding Complete! Default vehicles & Admin user created.");
  process.exit(0);
};

seedData().catch(err => {
  console.error("❌ Seed Error:", err);
  process.exit(1);
});
