import mongoose from "mongoose";

const billingItemSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: ["Parking", "Toll", "MCD", "InterstateTax", "Fuel", "Other"],
      required: true,
    },
    amount: { type: Number, default: 0 },
    image: { type: String, default: null },
    note: { type: String, default: "" },
  },
  { _id: false }
);

const receivingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    createdByRole: { type: String, enum: ["admin", "subadmin"] },
    lastEditedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    lastEditedAt: { type: Date },
    dutyStartDate: { type: Date, required: true },
    dutyStartTime: { type: String, required: true },
    dutyEndDate: { type: Date, required: true },
    dutyEndTime: { type: String, required: true },
    dutyStartKm: { type: Number, required: true },
    dutyEndKm: { type: Number, required: true },
    dutyType: { type: String, required: true },
    dailyAllowance: { type: Number, default: 0 },
    outstationAllowance: { type: Number, default: 0 },
    earlyStartAllowance: { type: Number, default: 0 },
    nightAllowance: { type: Number, default: 0 },
    receivedFromCompany: { type: Number, default: 0 },
    receivedFromClient: { type: Number, default: 0 },
    overTime: { type: Number, default: 0 },
    sundayAllowance: { type: Number, default: 0 },
    outstationOvernightAllowance: { type: Number, default: 0 },
    extraDutyAllowance: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    billingItems: [billingItemSchema],
    totalAllowances: { type: Number, default: 0 },
  },
  { timestamps: true }
);

receivingSchema.index({ userId: 1, bookingId: 1 }, { unique: true });
receivingSchema.pre("save", function (next) {
  this.totalAllowances =
    (this.dailyAllowance || 0) +
    (this.outstationAllowance || 0) +
    (this.earlyStartAllowance || 0) +
    (this.nightAllowance || 0) +
    (this.overTime || 0) +
    (this.sundayAllowance || 0) +
    (this.outstationOvernightAllowance || 0) +
    (this.extraDutyAllowance || 0);
  next();
});

export default mongoose.model("Receiving", receivingSchema);
