import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "subadmin"],
    default: "subadmin"
  },
  permissions: {
    type: [String],
    default: []
  },

  wallet: {
    balance: { type: Number, default: 0 }
  }

}, { timestamps: true });

export default mongoose.model("Admin", adminSchema);
