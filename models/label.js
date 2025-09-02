import mongoose from 'mongoose';

const labelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  color: { type: String, default: '#888888' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'admin' },
  role: { type: String, enum: ['admin','subadmin'], required: true },
}, { timestamps: true });

labelSchema.index({ name: 1 }, { unique: true });

export default mongoose.model('Label', labelSchema);