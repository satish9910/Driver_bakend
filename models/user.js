// models/User.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
   role: { type: String, enum: ["admin", "subadmin", "user"], default: "user" }, // ✅ Fixed
    drivercode: { type: String, required: true },
    mobile: { type: String, required: true },
    password: { type: String, required: true },
    profilePicture: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    // Wallet for the user (drivers)
    wallet: {
      balance: { type: Number, default: 0 },
    },
    bookings: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Booking",
      },
    ],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
