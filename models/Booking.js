
import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
  {
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    expenses: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Expenses",
      }],
    data: [
      {
        key: { type: String },
        value: { type: mongoose.Schema.Types.Mixed }, 
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Booking", bookingSchema);
