import mongoose from "mongoose";

// Billing Item sub-schema
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

const expenseSchema = new mongoose.Schema(
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
    // Admin/Subadmin ownership (when created/edited from admin panel)
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    createdByRole: { type: String, enum: ["admin", "subadmin", "user"], default: "user" },
    lastEditedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    lastEditedByRole: { type: String, enum: ["admin", "subadmin", "user"] },
    lastEditedAt: { type: Date },

    // Billing Items
    billingItems: [billingItemSchema],

    // Allowances (only essential ones as requested)
    dailyAllowance: { type: Number, default: 0 },
    outstationAllowance: { type: Number, default: 0 },
    nightAllowance: { type: Number, default: 0 },

    // Notes
    notes: { type: String, default: "" },

    // Auto-calculated
    totalAllowances: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Ensure unique expense record per user & booking
expenseSchema.index({ userId: 1, bookingId: 1 }, { unique: true });

// Pre-save hook to auto-calc total allowances (simplified)
expenseSchema.pre("save", function (next) {
  this.totalAllowances =
    (this.dailyAllowance || 0) +
    (this.outstationAllowance || 0) +
    (this.nightAllowance || 0);
  next();
});

export default mongoose.models.Expenses ||
  mongoose.model("Expenses", expenseSchema);
