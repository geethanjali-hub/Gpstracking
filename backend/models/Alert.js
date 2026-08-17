import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  vehicleId: { type: String, required: true, index: true },
  vehicleName: { type: String, default: '' },
  type: { type: String, required: true },
  message: { type: String, required: true },
  level: { type: String, enum: ['critical', 'warning', 'info'], default: 'warning' },
  lat: { type: Number },
  lng: { type: Number },
  timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

export const Alert = mongoose.model('Alert', alertSchema);
