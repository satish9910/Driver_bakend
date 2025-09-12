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
    createdByRole: { type: String, enum: ["admin", "subadmin", "user"], default: "user" },
    lastEditedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    lastEditedByRole: { type: String, enum: ["admin", "subadmin", "user"] },
    lastEditedAt: { type: Date },
    
    // Allowances only (duty fields moved to separate DutyInfo model)
    dailyAllowance: { type: Number, default: 0 },
    outstationAllowance: { type: Number, default: 0 },
    nightAllowance: { type: Number, default: 0 },
    
    // Client-related receiving fields
    receivedFromClient: { type: Number, default: 0 },
    clientAdvanceAmount: { type: Number, default: 0 },
    clientBonusAmount: { type: Number, default: 0 },
    
    // Additional receiving fields
    incentiveAmount: { type: Number, default: 0 },
    
    notes: { type: String, default: "" },
    billingItems: [billingItemSchema],
    totalAllowances: { type: Number, default: 0 },
    totalReceivingAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

receivingSchema.index({ userId: 1, bookingId: 1 }, { unique: true });
receivingSchema.pre("save", function (next) {
  // Calculate total allowances (only allowance fields)
  this.totalAllowances =
    (this.dailyAllowance || 0) +
    (this.outstationAllowance || 0) +
    (this.nightAllowance || 0);
    
  // Calculate total receiving amount (all receiving fields)
  this.totalReceivingAmount = 
    (this.dailyAllowance || 0) +
    (this.outstationAllowance || 0) +
    (this.nightAllowance || 0) +
    (this.receivedFromClient || 0) +
    (this.clientAdvanceAmount || 0) +
    (this.clientBonusAmount || 0) +
    (this.incentiveAmount || 0);
    
  next();
});

export default mongoose.model("Receiving", receivingSchema);
