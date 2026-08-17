import mongoose from 'mongoose';

const telemetryHistorySchema = new mongoose.Schema({
  vehicleId: { type: String, required: true, index: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  speed: { type: Number, default: 0 },
  altitude: { type: Number, default: 0 },
  battery: { type: Number, default: 100 },
  engineStatus: { type: Boolean, default: false },
  fuelLevel: { type: Number, default: 100 },
  satellites: { type: Number, default: 0 },
  address: { type: String, default: '' },
  street: { type: String, default: '' },
  area: { type: String, default: '' },
  status: { type: String, default: 'moving' },
  timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

// Compound index for lightning-fast historical range queries per vehicle
telemetryHistorySchema.index({ vehicleId: 1, timestamp: -1 });

export const TelemetryHistory = mongoose.model('TelemetryHistory', telemetryHistorySchema);
