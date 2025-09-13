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

    // Add to admin wallet (normal admin wallet logic)
    admin.wallet.balance += amount;
    await admin.save();

    // Save transaction
    const transaction = await Transaction.create({
      fromAdminId: req.user.userId,
      adminId: admin._id,
      amount,
      type: "credit",
      description: description || `Admin wallet credit by ${req.user.role}`,
      balanceAfter: admin.wallet.balance,
      category: "admin_wallet",
    });

    res.json({ 
      message: "Money added to admin wallet successfully", 
      wallet: admin.wallet, 
      transaction,
      explanation: "Admin wallet uses standard wallet logic (credit increases balance)"
    });
  } catch (err) {
    res.status(500).json({ message: "Error adding money to admin wallet", error: err.message });
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
      return res.status(400).json({ message: "Insufficient balance in admin wallet" });
    }

    // Deduct from admin wallet (normal admin wallet logic)
    admin.wallet.balance -= amount;
    await admin.save();

    // Save transaction
    const transaction = await Transaction.create({
      fromAdminId: req.user.userId,
      adminId: admin._id,
      amount,
      type: "debit",
      description: description || `Admin wallet deduction by ${req.user.role}`,
      balanceAfter: admin.wallet.balance,
      category: "admin_wallet",
    });

    res.json({ 
      message: "Money deducted from admin wallet successfully", 
      wallet: admin.wallet, 
      transaction,
      explanation: "Admin wallet uses standard wallet logic (debit reduces balance)"
    });
  } catch (err) {
    res.status(500).json({ message: "Error deducting money from admin wallet", error: err.message });
  }
};

export const getAllTransactions = async (req, res) => {
  try {
    const role = req.user?.role;
    const userId = req.user?.userId;

    if (role === "admin") {
      // Show all admin transactions
      const transactions = await Transaction.find({ adminId: userId })
        .populate("adminId", "name email role")
        .sort({ createdAt: -1 });
      return res.json(transactions);
    } else if (role === "subadmin") {
      // Show all subadmin transactions
      const transactions = await Transaction.find({ adminId: userId })
        .populate("adminId", "name email role")
        .sort({ createdAt: -1 });
      return res.json(transactions);
    } else {
      return res.status(403).json({ message: "Only admin or subadmin can view transactions" });
    }
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

    // REVERSED: Transfer to user creates debt (negative balance)
    if (!user.wallet) user.wallet = { balance: 0 };
    user.wallet.balance -= amt; // Changed from += to -=
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
      type: "debit", // Changed from credit to debit
      description: description || `Company advance from ${admin.role}`,
      balanceAfter: user.wallet.balance,
      category: "transfer",
    });

    res.json({
      message: "Transfer successful - driver now owes company",
      adminWallet: admin.wallet,
      userWallet: user.wallet,
      transactions: { adminTxn, userTxn },
      explanation: "User negative balance means driver owes money to company"
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
      balanceExplanation: {
        message: (user.wallet?.balance || 0) < 0 
          ? "Negative balance: Driver owes money to company"
          : (user.wallet?.balance || 0) > 0 
          ? "Positive balance: Company owes money to driver"
          : "Account is balanced"
      }
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

// Admin/Subadmin view transactions for a specific user by ID
export const getUserTransactionsById = async (req, res) => {
  try {
    const { userId } = req.params;
    const role = req.user?.role;
    if (role !== "admin" && role !== "subadmin") {
      return res.status(403).json({ message: "Only admin or subadmin can view user transactions" });
    }

    const user = await User.findById(userId).select("_id");
    if (!user) return res.status(404).json({ message: "User not found" });

    const transactions = await Transaction.find({ userId })
      .populate("fromAdminId", "name email role")
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: "Error fetching user transactions", error: err.message });
  }
};

// Admin can credit a user's wallet directly (adjustment)
// NOTE: "Adding money" means driver owes company -> NEGATIVE balance

export const addMoneyToUserWallet = async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== "admin" && role !== "subadmin") {
      return res.status(403).json({ message: "Only admin or subadmin can add to user wallets" });
    }
    const { userId, amount, description } = req.body;
    if (!userId || amount == null) return res.status(400).json({ message: "userId and amount are required" });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: "Amount must be positive" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.wallet) user.wallet = { balance: 0 };
    // REVERSED: When admin adds money, user owes company (negative balance)
    user.wallet.balance -= amt;
    await user.save();

    const txn = await Transaction.create({
      fromAdminId: req.user.userId,
      userId: user._id,
      amount: amt,
      type: "debit", // Changed from credit to debit
      description: description || `Company advance to driver - ${role}`,
      balanceAfter: user.wallet.balance,
      category: "user_wallet",
    });

    res.json({ 
      message: "Company advance added - driver now owes company", 
      wallet: user.wallet, 
      transaction: txn,
      explanation: "Negative balance means driver owes money to company" 
    });
  } catch (err) {
    res.status(500).json({ message: "Error adding money to user", error: err.message });
  }
};

// Admin or subadmin can debit a user's wallet directly (adjustment)
// NOTE: "Deducting money" means company owes driver -> POSITIVE balance
export const deductMoneyFromUserWallet = async (req, res) => {
  try {
    const role = req.user?.role;
    if (role !== "admin" && role !== "subadmin") {
      return res.status(403).json({ message: "Only admin or subadmin can deduct from user wallets" });
    }
    const { userId, amount, description } = req.body;
    if (!userId || amount == null) return res.status(400).json({ message: "userId and amount are required" });
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ message: "Amount must be positive" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    
    if (!user.wallet) user.wallet = { balance: 0 };
    // REVERSED: When admin deducts money, company owes driver (positive balance)
    user.wallet.balance += amt;
    await user.save();

    const txn = await Transaction.create({
      fromAdminId: req.user.userId,
      userId: user._id,
      amount: amt,
      type: "credit", // Changed from debit to credit
      description: description || `Company payment to driver - ${role}`,
      balanceAfter: user.wallet.balance,
      category: "user_wallet",
    });

    res.json({ 
      message: "Company payment processed - driver balance updated", 
      wallet: user.wallet, 
      transaction: txn,
      explanation: "Positive balance means company owes money to driver" 
    });
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
      balanceExplanation: {
        message: (user.wallet?.balance || 0) < 0 
          ? "Negative balance means you owe money to the company"
          : (user.wallet?.balance || 0) > 0 
          ? "Positive balance means the company owes you money"
          : "Your account is balanced with the company"
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching my wallet", error: err.message });
  }
};


//admin can see sub admin wallet and his transaction also add and deduct money


export const getSubAdminWalletById = async (req, res) => {
  try {
    const { subAdminId } = req.params;

    const subAdmin = await Admin.findById(subAdminId).select("name email role wallet");
    if (!subAdmin || subAdmin.role !== "subadmin") {
      return res.status(404).json({ message: "Subadmin not found" });
    }

    const transactions = await Transaction.find({ adminId: subAdminId, category: { $in: ["admin_wallet", "transfer"] } });

    const totalCredit = transactions
      .filter((t) => t.type === "credit")
      .reduce((sum, t) => sum + t.amount, 0);

    const totalDebit = transactions
      .filter((t) => t.type === "debit")
      .reduce((sum, t) => sum + t.amount, 0);

    res.json({
      subAdmin: { id: subAdmin._id, name: subAdmin.name, email: subAdmin.email, role: subAdmin.role },
      wallet: {
        balance: subAdmin.wallet?.balance || 0,
        totalCredit,
        totalDebit,
        transactionsCount: transactions.length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching subadmin wallet", error: err.message });
  }
};

export const addMoneyToSubAdminWallet = async (req, res) => {
  try{
    const { subAdminId, amount, description } = req.body;
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Only admin can add money to subadmin wallets" });
    }

    const subAdmin = await Admin.findById(subAdminId);
    if (!subAdmin || subAdmin.role !== "subadmin") {
      return res.status(404).json({ message: "Subadmin not found" });
    }

    // Add to subadmin wallet (normal admin wallet logic)
    subAdmin.wallet.balance += amount;
    await subAdmin.save();

    // Save transaction
    const transaction = await Transaction.create({
      fromAdminId: req.user.userId,
      adminId: subAdmin._id,
      amount,
      type: "credit",
      description: description || `Subadmin wallet credit by admin`,
      balanceAfter: subAdmin.wallet.balance,
      category: "admin_wallet",
    });

    res.json({ 
      message: "Money added to subadmin wallet successfully", 
      wallet: subAdmin.wallet, 
      transaction,
      explanation: "Subadmin wallet uses standard wallet logic (credit increases balance)"
    });
  } catch (err) {
    res.status(500).json({ message: "Error adding money to subadmin wallet", error: err.message });
  }
};

export const deductMoneyFromSubAdminWallet = async (req, res) => {
  try {
    const { subAdminId, amount, description } = req.body;
    if (req.user?.role !== "admin") {
      return res.status(403).json({ message: "Only admin can deduct money from subadmin wallets" });
    }

    const subAdmin = await Admin.findById(subAdminId);
    if (!subAdmin || subAdmin.role !== "subadmin") {
      return res.status(404).json({ message: "Subadmin not found" });
    }

    if (subAdmin.wallet.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance in subadmin wallet" });
    }

    // Deduct from subadmin wallet (normal admin wallet logic)
    subAdmin.wallet.balance -= amount;
    await subAdmin.save();

    // Save transaction
    const transaction = await Transaction.create({
      fromAdminId: req.user.userId,
      adminId: subAdmin._id,
      amount,
      type: "debit",
      description: description || `Subadmin wallet deduction by admin`,
      balanceAfter: subAdmin.wallet.balance,
      category: "admin_wallet",
    });

    res.json({ 
      message: "Money deducted from subadmin wallet successfully", 
      wallet: subAdmin.wallet, 
      transaction,
      explanation: "Subadmin wallet uses standard wallet logic (debit reduces balance)"
    });
  } catch (err) {
    res.status(500).json({ message: "Error deducting money from subadmin wallet", error: err.message });
  }
};

export const getSubAdminWalletTransactions = async (req, res) => {
  try {
    const { subAdminId } = req.params;

    const subAdmin = await Admin.findById(subAdminId).select("name email role wallet");
    if (!subAdmin || subAdmin.role !== "subadmin") {
      return res.status(404).json({ message: "Subadmin not found" });
    }

    const transactions = await Transaction.find({ adminId: subAdminId })
      .sort({ createdAt: -1 })
      .populate("fromAdminId", "name email role");
      
    res.json({
      subAdmin: { id: subAdmin._id, name: subAdmin.name, email: subAdmin.email, role: subAdmin.role },
      transactions,
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching subadmin wallet transactions", error: err.message });
  }
};

// 🚀 NEW: Admin/Sub-admin collect money FROM driver wallet TO their wallet
export const collectMoneyFromDriver = async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    const role = req.user?.role;
    const adminId = req.user?.userId;

    // Role validation
    if (role !== "admin" && role !== "subadmin") {
      return res.status(403).json({ message: "Only admin or subadmin can collect from driver" });
    }

    // Input validation
    if (!userId || amount == null) {
      return res.status(400).json({ message: "userId and amount are required" });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return res.status(400).json({ message: "Amount must be positive" });
    }

    // Find driver and admin
    const driver = await User.findById(userId);
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const admin = await Admin.findById(adminId);
    if (!admin) return res.status(404).json({ message: "Admin not found" });

    if (!driver.wallet) driver.wallet = { balance: 0 };

    // REVERSED: Driver must have negative balance (driver owes company)
    if (driver.wallet.balance >= 0) {
      return res.status(400).json({ 
        message: "Driver has no debt to collect",
        currentBalance: driver.wallet.balance,
        explanation: driver.wallet.balance > 0 
          ? "Company owes money to driver - cannot collect debt" 
          : "Driver account is balanced - no debt to collect"
      });
    }

    // Check if collection amount is within debt limit
    if (Math.abs(driver.wallet.balance) < amt) {
      return res.status(400).json({ 
        message: "Collection amount exceeds driver's debt",
        currentDebt: Math.abs(driver.wallet.balance),
        requestedAmount: amt,
        explanation: "Cannot collect more than what driver owes"
      });
    }

    // Transfer money: Driver debt → Admin (reduce debt, increase admin wallet)
    driver.wallet.balance += amt;  // Reduce driver's debt (make balance less negative)
    await driver.save();

    admin.wallet.balance += amt;   // Increase admin wallet
    await admin.save();

    // Record transactions
    const driverTxn = await Transaction.create({
      fromAdminId: admin._id,
      userId: driver._id,
      amount: amt,
      type: "credit",
      description: description || `Debt payment collected by ${role}`,
      balanceAfter: driver.wallet.balance,
      category: "transfer",
    });

    const adminTxn = await Transaction.create({
      fromAdminId: admin._id,
      adminId: admin._id,
      amount: amt,
      type: "credit",
      description: description || `Debt collection from driver ${driver.name}`,
      balanceAfter: admin.wallet.balance,
      category: "transfer",
    });

    res.json({
      message: "Driver debt collected successfully",
      driverWallet: driver.wallet,
      adminWallet: admin.wallet,
      transactions: { driverTxn, adminTxn },
      explanation: {
        driverBalance: driver.wallet.balance < 0 
          ? "Driver still owes money to company" 
          : driver.wallet.balance > 0 
          ? "Collection exceeded debt - company now owes driver" 
          : "Driver debt fully settled",
        action: "Debt collection successfully transferred to admin wallet"
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Error collecting money from driver", error: err.message });
  }
};



