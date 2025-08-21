import Admin from "../models/adminModel.js";
import User from "../models/user.js";
import Transaction from "../models/transectionModel.js";

export const addMoneyToWallet = async (req, res) => {
  try {
    const { adminId, amount, description } = req.body;
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Only admin can add money to admin/subadmin wallets" });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    // update balance
    admin.wallet.balance += amount;
    await admin.save();

    // save transaction
    const transaction = await Transaction.create({
  fromAdminId: req.user.userId,
      adminId: admin._id,
      amount,
      type: "credit",
      description,
  balanceAfter: admin.wallet.balance,
  category: "admin_wallet",
    });

    res.json({ message: "Money added successfully", wallet: admin.wallet, transaction });
  } catch (err) {
    res.status(500).json({ message: "Error adding money", error: err.message });
  }
};

export const deductMoneyFromWallet = async (req, res) => {
  try {
    const { adminId, amount, description } = req.body;
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Only admin can deduct money from admin/subadmin wallets" });
    }

    const admin = await Admin.findById(adminId);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    if (admin.wallet.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // update balance
    admin.wallet.balance -= amount;
    await admin.save();

    // save transaction
    const transaction = await Transaction.create({
  fromAdminId: req.user.userId,
      adminId: admin._id,
      amount,
      type: "debit",
      description,
  balanceAfter: admin.wallet.balance,
  category: "admin_wallet",
    });

    res.json({ message: "Money deducted successfully", wallet: admin.wallet, transaction });
  } catch (err) {
    res.status(500).json({ message: "Error deducting money", error: err.message });
  }
};

export const getAllTransactions = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Only admin can view all transactions" });
    }
    const transactions = await Transaction.find()
      .populate("adminId", "name email role") // show admin info
  .populate("userId", "name email")
      .sort({ createdAt: -1 }); // latest first

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: "Error fetching transactions", error: err.message });
  }
};

export const getMyTransactions = async (req, res) => {
  try {
  const adminId = req.user?.userId;

  const transactions = await Transaction.find({ adminId })
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: "Error fetching user transactions", error: err.message });
  }
};


// Get wallet details for one admin/subadmin
export const getWalletDetails = async (req, res) => {
  try {
    const { adminId } = req.params;

    const admin = await Admin.findById(adminId);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    // fetch all transactions for this admin
  const transactions = await Transaction.find({ adminId, category: { $in: ["admin_wallet", "transfer"] } });

    const totalCredit = transactions
      .filter(t => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDebit = transactions
      .filter(t => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0);

    res.json({
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
      wallet: {
        balance: admin.wallet.balance,
        totalCredit,
        totalDebit,
        transactionsCount: transactions.length,
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching wallet details", error: err.message });
  }
};

// Transfer money from Admin/Subadmin wallet to a User wallet
export const transferMoneyToUser = async (req, res) => {
  try {
    const { userId, amount, description } = req.body;

    // Role guard: must be admin or subadmin
    const requesterRole = req.user?.role;
    const fromAdminId = req.user?.userId; // token contains userId for Admin model? If not, accept body adminId

    if (!requesterRole || (requesterRole !== "admin" && requesterRole !== "subadmin")) {
      return res.status(403).json({ message: "Only admin or subadmin can transfer" });
    }

    if (!userId || amount == null) {
      return res.status(400).json({ message: "userId and amount are required" });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "Amount must be a positive number" });
    }

    const admin = await Admin.findById(fromAdminId);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (admin.wallet.balance < amt) {
      return res.status(400).json({ message: "Insufficient admin wallet balance" });
    }

    // Deduct from admin wallet
    admin.wallet.balance -= amt;
    await admin.save();

    // Credit to user wallet
    if (!user.wallet) user.wallet = { balance: 0 };
    user.wallet.balance += amt;
    await user.save();

    // Record transactions
    const adminTxn = await Transaction.create({
      fromAdminId: admin._id,
      adminId: admin._id,
      amount: amt,
      type: "debit",
      description: description || `Transfer to user ${user.name}`,
      balanceAfter: admin.wallet.balance,
      category: "transfer",
    });

    const userTxn = await Transaction.create({
      fromAdminId: admin._id,
      userId: user._id,
      amount: amt,
      type: "credit",
      description: description || `Received from ${admin.role}`,
      balanceAfter: user.wallet.balance,
      category: "transfer",
    });

    res.json({
      message: "Transfer successful",
      adminWallet: admin.wallet,
      userWallet: user.wallet,
      transactions: { adminTxn, userTxn },
    });
  } catch (err) {
    res.status(500).json({ message: "Error transferring money", error: err.message });
  }
};

// Get user wallet details (for user or admin viewing)
export const getUserWalletDetails = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select("name email wallet");
    if (!user) return res.status(404).json({ message: "User not found" });

    const transactions = await Transaction.find({ userId, category: { $in: ["user_wallet", "transfer"] } });

    const totalCredit = transactions
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDebit = transactions
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0);

    res.json({
      user: { id: user._id, name: user.name, email: user.email },
      wallet: {
        balance: user.wallet?.balance || 0,
        totalCredit,
        totalDebit,
        transactionsCount: transactions.length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching user wallet", error: err.message });
  }
};

// Get transactions for the authenticated user
export const getMyUserTransactions = async (req, res) => {
  try {
    const userId = req.user?.userId;

    const transactions = await Transaction.find({ userId })
      .populate("fromAdminId", "name email role")
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: "Error fetching user transactions", error: err.message });
  }
};

// Admin can credit a user's wallet directly (adjustment)
export const addMoneyToUserWallet = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Only admin can add to user wallets" });
    }
    const { userId, amount, description } = req.body;
    if (!userId || amount == null) return res.status(400).json({ message: "userId and amount are required" });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: "Amount must be positive" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.wallet) user.wallet = { balance: 0 };
    user.wallet.balance += amt;
    await user.save();

    const txn = await Transaction.create({
      fromAdminId: req.user.userId,
      userId: user._id,
      amount: amt,
      type: "credit",
      description: description || "Admin credit",
      balanceAfter: user.wallet.balance,
      category: "user_wallet",
    });

    res.json({ message: "Money added to user wallet", wallet: user.wallet, transaction: txn });
  } catch (err) {
    res.status(500).json({ message: "Error adding money to user", error: err.message });
  }
};

// Admin can debit a user's wallet directly (adjustment)
export const deductMoneyFromUserWallet = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Only admin can deduct from user wallets" });
    }
    const { userId, amount, description } = req.body;
    if (!userId || amount == null) return res.status(400).json({ message: "userId and amount are required" });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: "Amount must be positive" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.wallet || user.wallet.balance < amt) return res.status(400).json({ message: "Insufficient user wallet balance" });

    user.wallet.balance -= amt;
    await user.save();

    const txn = await Transaction.create({
      fromAdminId: req.user.userId,
      userId: user._id,
      amount: amt,
      type: "debit",
      description: description || "Admin debit",
      balanceAfter: user.wallet.balance,
      category: "user_wallet",
    });

    res.json({ message: "Money deducted from user wallet", wallet: user.wallet, transaction: txn });
  } catch (err) {
    res.status(500).json({ message: "Error deducting money from user", error: err.message });
  }
};

// Admin transfers from own wallet to another admin/subadmin wallet
export const transferMoneyToAdmin = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Only admin can transfer to subadmin/admin" });
    }
    const { targetAdminId, amount, description } = req.body;
    if (!targetAdminId || amount == null) return res.status(400).json({ message: "targetAdminId and amount are required" });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: "Amount must be positive" });

    const fromAdmin = await Admin.findById(req.user.userId);
    if (!fromAdmin) return res.status(404).json({ message: "Source admin not found" });
    const toAdmin = await Admin.findById(targetAdminId);
    if (!toAdmin) return res.status(404).json({ message: "Target admin/subadmin not found" });

    if (fromAdmin.wallet.balance < amt) return res.status(400).json({ message: "Insufficient balance" });

    fromAdmin.wallet.balance -= amt;
    await fromAdmin.save();

    toAdmin.wallet.balance += amt;
    await toAdmin.save();

    const debitTxn = await Transaction.create({
      fromAdminId: fromAdmin._id,
      adminId: fromAdmin._id,
      amount: amt,
      type: "debit",
      description: description || `Transfer to ${toAdmin.name}`,
      balanceAfter: fromAdmin.wallet.balance,
      category: "transfer",
    });
    const creditTxn = await Transaction.create({
      fromAdminId: fromAdmin._id,
      adminId: toAdmin._id,
      amount: amt,
      type: "credit",
      description: description || `Received from ${fromAdmin.name}`,
      balanceAfter: toAdmin.wallet.balance,
      category: "transfer",
    });

    res.json({ message: "Transfer successful", fromWallet: fromAdmin.wallet, toWallet: toAdmin.wallet, transactions: { debitTxn, creditTxn } });
  } catch (err) {
    res.status(500).json({ message: "Error transferring to admin", error: err.message });
  }
};

// Admin/subadmin view own admin wallet transactions
export const getMyAdminTransactions = async (req, res) => {
  try {
    const adminId = req.user?.userId;
    const transactions = await Transaction.find({ adminId }).sort({ createdAt: -1 }).populate("fromAdminId", "name email role");
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: "Error fetching my admin transactions", error: err.message });
  }
};

// Get wallet details for the authenticated user
export const getMyWalletDetails = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const user = await User.findById(userId).select("name email wallet");
    if (!user) return res.status(404).json({ message: "User not found" });

    const transactions = await Transaction.find({ userId, category: { $in: ["user_wallet", "transfer"] } });

    const totalCredit = transactions
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDebit = transactions
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0);

    res.json({
      user: { id: user._id, name: user.name, email: user.email },
      wallet: {
        balance: user.wallet?.balance || 0,
        totalCredit,
        totalDebit,
        transactionsCount: transactions.length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching my wallet", error: err.message });
  }
};
