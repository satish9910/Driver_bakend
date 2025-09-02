import mongoose from "mongoose";

// Individual booking data key/value pair (from uploaded sheet)
const bookingDataSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, default: "" },
  },
  { _id: false }
);

const settlementSchema = new mongoose.Schema(
  {
    isSettled: { type: Boolean, default: false },
    settlementAmount: { type: Number, default: 0 },
    adminAdjustments: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    settledAt: { type: Date },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    driver: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    data: [bookingDataSchema],
    // Driver submitted expenses (array) & primary (latest or chosen)
    expenses: [{ type: mongoose.Schema.Types.ObjectId, ref: "Expenses" }],
    primaryExpense: { type: mongoose.Schema.Types.ObjectId, ref: "Expenses" },
    receiving: { type: mongoose.Schema.Types.ObjectId, ref: "Receiving" },
    labels: [{ type: mongoose.Schema.Types.ObjectId, ref: "Label" }],
    status: { type: Number, default: 0 }, // 0 = open, 1 = completed
    settlement: { type: settlementSchema, default: () => ({}) },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

export default mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
