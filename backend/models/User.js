import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin', 'operator', 'viewer'], default: 'viewer' },
  assignedVehicle: { type: String, default: '' },
  status: { type: String, default: 'Active' }
}, { timestamps: true });

export const User = mongoose.model('User', userSchema);
