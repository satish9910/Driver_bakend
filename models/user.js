// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  mobile: { type: String, required: true },
  password: { type: String, required: true },
  isActive: { type: Boolean, default: true },
}, { timestamps: true});

const User = mongoose.model("User", userSchema);
export default User;
