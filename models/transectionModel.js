import mongoose from "mongoose";

// Generalized transaction schema supporting Admin/Subadmin and User wallets
const transactionSchema = new mongoose.Schema(
  {
    // Who initiated the transaction (admin or subadmin), optional for system credits
    fromAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    // Target admin wallet (for admin wallet events)
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    // Target user wallet (for user wallet events)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Money movement
    amount: { type: Number, required: true, min: 0 },
    // credit = add to target wallet, debit = remove from target wallet
    type: { type: String, enum: ["credit", "debit"], required: true },
    description: { type: String },

    // Wallet balance after this transaction for the target entity
    balanceAfter: { type: Number },

    // Optional tag to classify
    category: { type: String, enum: ["admin_wallet", "user_wallet", "transfer"], default: "admin_wallet" },
    date: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);
