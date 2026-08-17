import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  vin: { type: String, default: '' },
  topic: { type: String, required: true },
  broker: { type: String, default: 'mqtt://test.mosquitto.org:1883' },
  ownerUser: { type: String, default: 'admin' },
  userName: { type: String, default: '' },
  status: { type: String, default: 'offline' },
  latestTelemetry: {
    lat: { type: Number, default: 0 },
    lng: { type: Number, default: 0 },
    speed: { type: Number, default: 0 },
    altitude: { type: Number, default: 0 },
    battery: { type: Number, default: 100 },
    engineStatus: { type: Boolean, default: false },
    fuelLevel: { type: Number, default: 100 },
    satellites: { type: Number, default: 0 },
    address: { type: String, default: '' },
    isOnline: { type: Boolean, default: false },
    status: { type: String, default: 'offline' },
    timestamp: { type: Date, default: Date.now }
  }
}, { timestamps: true });

export const Vehicle = mongoose.model('Vehicle', vehicleSchema);
