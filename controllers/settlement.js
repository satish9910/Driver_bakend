// controllers/settlement.js
import Booking from "../models/Booking.js";
import User from "../models/user.js";

import Transaction from "../models/transectionModel.js";
import Admin from "../models/adminModel.js";

/**
 * Calculate settlement amounts for a booking
 * @param {Object} booking - Booking document with populated expense/receiving
 * @returns {Object} Settlement calculation breakdown
 */
const calculateSettlementAmounts = (booking) => {
  let expenseTotal = 0;
  let receivingTotal = 0;
  let expenseBreakdown = null;
  let receivingBreakdown = null;

  // Calculate expense totals (use primaryExpense or first expense)
  const primaryExpense =
    booking.primaryExpense || (booking.expenses && booking.expenses[0]);
  if (primaryExpense) {
    const billingSum = (primaryExpense.billingItems || []).reduce(
      (s, i) => s + (Number(i.amount) || 0),
      0
    );
    const allowancesSum = primaryExpense.totalAllowances || 0;
    expenseTotal = billingSum + allowancesSum;
    expenseBreakdown = {
      billingSum,
      allowancesSum,
      totalExpense: expenseTotal,
    };
  }

  // Calculate receiving totals
  if (booking.receiving) {
    const r = booking.receiving;
    const receivingBillingSum = (r.billingItems || []).reduce(
      (s, i) => s + (Number(i.amount) || 0),
      0
    );
    const receivingAmount = r.totalReceivingAmount || 0;
    receivingTotal = receivingBillingSum + receivingAmount;
    receivingBreakdown = {
      billingSum: receivingBillingSum,
      allowancesSum: r.totalAllowances || 0,
      receivingAmount: receivingAmount,
      totalReceiving: receivingTotal,
    };
  }

  const difference = Number((expenseTotal - receivingTotal).toFixed(2));
  const settlementAmount = difference; // positive = driver owes money, negative = company owes driver

  return {
    expenseTotal,
    receivingTotal,
    difference,
    settlementAmount,
    expenseBreakdown,
    receivingBreakdown,
  };
};

/**
 * Get settlement preview for a booking (no actual settlement)
 * GET /api/admin/booking/:bookingId/settlement-preview
 */
export const getSettlementPreview = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { role } = req.user;

    if (!["admin", "subadmin"].includes(role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const booking = await Booking.findById(bookingId)
      .populate({
        path: "driver",
        select: "name email mobile drivercode wallet",
      })
      .populate({ path: "expenses", model: "Expenses" })
      .populate({ path: "primaryExpense", model: "Expenses" })
      .populate({ path: "receiving", model: "Receiving" });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!booking.driver) {
      return res
        .status(400)
        .json({ message: "No driver assigned to this booking" });
    }

    const calculation = calculateSettlementAmounts(booking);

    res.json({
      success: true,
      booking: {
        _id: booking._id,
        status: booking.status,
        driver: booking.driver,
        settlement: booking.settlement,
      },
      calculation,
      preview: {
        currentWalletBalance: booking.driver.wallet?.balance || 0,
        settlementAmount: calculation.settlementAmount,
        projectedWalletBalance: (booking.driver.wallet?.balance || 0) + calculation.settlementAmount,
        settlementAction:
          calculation.settlementAmount > 0
            ? "credit"
            : calculation.settlementAmount < 0
            ? "debit"
            : "none",
        settlementAbsAmount: Math.abs(calculation.settlementAmount),
        adminWalletNote: "Admin wallet will NOT be automatically affected during settlement",
        manualTransferRequired: calculation.settlementAmount > 0,
        balanceExplanation: {
          current: (booking.driver.wallet?.balance || 0) < 0 
            ? `Driver currently owes company ₹${Math.abs(booking.driver.wallet?.balance || 0)}` 
            : (booking.driver.wallet?.balance || 0) > 0 
            ? `Company currently owes driver ₹${booking.driver.wallet?.balance || 0}` 
            : "Account is currently balanced",
          afterSettlement: ((booking.driver.wallet?.balance || 0) + calculation.settlementAmount) < 0 
            ? `After settlement, driver will owe company ₹${Math.abs((booking.driver.wallet?.balance || 0) + calculation.settlementAmount)}` 
            : ((booking.driver.wallet?.balance || 0) + calculation.settlementAmount) > 0 
            ? `After settlement, company will owe driver ₹${(booking.driver.wallet?.balance || 0) + calculation.settlementAmount} - Manual admin transfer needed` 
            : "After settlement, account will be balanced",
          settlementDescription: calculation.settlementAmount > 0
            ? `Driver spent ₹${calculation.settlementAmount} more than received - company owes driver (manual transfer required)`
            : calculation.settlementAmount < 0
            ? `Driver received ₹${Math.abs(calculation.settlementAmount)} more than spent - driver owes company`
            : "Expenses and receiving are balanced"
        },
      },
    });
  } catch (error) {
    console.error("Settlement preview error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Process settlement for a booking
 * POST /api/admin/booking/:bookingId/settle
 */

export const processBookingSettlement = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { role, userId: adminId } = req.user;
    const {
      adjustmentAmount,
      adminAdjustments = 0,
      notes = "",
      markCompleted = true,
    } = req.body;

    if (!["admin", "subadmin"].includes(role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const booking = await Booking.findById(bookingId)
      .populate({
        path: "driver",
        select: "name email mobile drivercode wallet",
      })
      .populate({ path: "primaryExpense", model: "Expenses" })
      .populate({ path: "receiving", model: "Receiving" });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!booking.driver) {
      return res
        .status(400)
        .json({ message: "No driver assigned to this booking" });
    }

    if (booking.settlement.isSettled) {
      return res.status(400).json({ message: "Booking already settled" });
    }

    const driver = booking.driver;
    if (!driver.wallet) driver.wallet = { balance: 0 };

    // Get admin/subadmin who is adjusting
    const performingAdmin = await Admin.findById(adminId).select(
      "name role wallet"
    );
    if (!performingAdmin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    if (!performingAdmin.wallet) performingAdmin.wallet = { balance: 0 };

    const driverPrevBalance = driver.wallet.balance;
    const adminPrevBalance = performingAdmin.wallet.balance;

    let driverTransaction = null;
    let adminTransaction = null;
    let settlementAction = "none";

    // Calculate settlement difference if amount not provided
    const calc = calculateSettlementAmounts(booking);
    const hasCustom = Object.prototype.hasOwnProperty.call(
      req.body,
      "adjustmentAmount"
    );
    let finalAmount =
      (hasCustom
        ? Number(adjustmentAmount || 0)
        : Number(calc.settlementAmount || 0)) + Number(adminAdjustments || 0);

    // Process settlement amount with reversed wallet logic
    if (finalAmount !== 0) {
      // In reversed wallet system:
      // - Current balance shows existing debt/credit
      // - Settlement amount shows additional debt/credit needed
      // - Final balance = current balance + settlement amount
      // - ONLY update driver wallet, NOT admin wallet automatically
      
      const prevBalance = driver.wallet.balance;
      driver.wallet.balance += finalAmount; // Add settlement amount to current balance
      const newBalance = driver.wallet.balance;
      
      // Determine action based on settlement amount
      if (finalAmount > 0) {
        // Positive settlement: Driver spent more than received (company owes driver more)
        settlementAction = "driver_credit_admin_debit"; // Using valid enum value
        
        // DO NOT automatically deduct from admin wallet
        // Admin will manually transfer money when they have sufficient balance

        // Create driver transaction only
        driverTransaction = await Transaction.create({
          userId: driver._id,
          fromAdminId: adminId,
          amount: finalAmount,
          type: "credit",
          description: `Settlement: Company owes driver ₹${finalAmount} for booking ${bookingId} by ${
            performingAdmin.name
          } (${role}) ${notes ? `- ${notes}` : ""} - Manual admin transfer required`,
          balanceAfter: newBalance,
          category: "user_wallet",
        });

        // No admin transaction created automatically
        adminTransaction = null;
      } else {
        // Negative settlement: Driver received more than spent (driver owes company more)
        const debitAmount = Math.abs(finalAmount);
        settlementAction = "driver_debit_admin_credit"; // Using valid enum value
        
        // DO NOT automatically credit admin wallet
        // This represents additional debt from driver to company

        // Create driver transaction only
        driverTransaction = await Transaction.create({
          userId: driver._id,
          fromAdminId: adminId,
          amount: debitAmount,
          type: "debit",
          description: `Settlement: Driver owes company ₹${debitAmount} for booking ${bookingId} by ${
            performingAdmin.name
          } (${role}) ${notes ? `- ${notes}` : ""} - Driver debt increased`,
          balanceAfter: newBalance,
          category: "user_wallet",
        });

        // No admin transaction created automatically
        adminTransaction = null;
      }

      await driver.save();
      // Do NOT save admin wallet changes during settlement
    }

    // Update booking settlement
    booking.settlement = {
      isSettled: true,
      settlementAmount: finalAmount,
      calculatedAmount: calc.settlementAmount,
      adminAdjustments: Number(adminAdjustments || 0),
      notes,
      settledAt: new Date(),
      settledBy: adminId,
      settledByRole: role,
      settledByName: performingAdmin.name,
      status: "completed",
      transactionId: driverTransaction?._id || null,
      adminTransactionId: adminTransaction?._id || null,
      action: settlementAction,
    };

    if (markCompleted) {
      booking.status = 1;
      booking.completedAt = new Date();
    }

    await booking.save();

    res.json({
      success: true,
      message: "Settlement processed successfully - Driver wallet updated",
      settlement: {
        amount: finalAmount,
        calculated: calc.settlementAmount,
        adminAdjustments: Number(adminAdjustments || 0),
        action: settlementAction,
        adjustedBy: `${performingAdmin.name} (${role})`,
        note: "Admin wallet not automatically affected - manual transfer required if company owes driver"
      },
      calculation: calc,
      transactions: {
        driver: driverTransaction
          ? {
              _id: driverTransaction._id,
              amount: driverTransaction.amount,
              type: driverTransaction.type,
              balanceAfter: driverTransaction.balanceAfter,
              description: driverTransaction.description,
            }
          : null,
        admin: null, // No automatic admin transaction during settlement
      },
      walletUpdate: {
        driver: {
          previousBalance: driverPrevBalance,
          newBalance: driver.wallet.balance,
          balanceChange: driver.wallet.balance - driverPrevBalance,
          explanation: driver.wallet.balance > 0 
            ? `Company owes driver ₹${driver.wallet.balance} - Admin should manually transfer when ready`
            : driver.wallet.balance < 0 
            ? `Driver owes company ₹${Math.abs(driver.wallet.balance)}`
            : "Account is balanced"
        },
        admin: {
          name: performingAdmin.name,
          role: role,
          previousBalance: adminPrevBalance,
          newBalance: performingAdmin.wallet.balance,
          note: "Admin wallet unchanged during settlement - manual transfer required for driver credits"
        },
      },
    });
  } catch (error) {
    console.error("Settlement processing error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get settlement history for a driver
 * GET /api/admin/driver/:driverId/settlements
 * 
 */
export const getDriverSettlements = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { role } = req.user;
    const { status, limit = 50, page = 1 } = req.query;

    if (!["admin", "subadmin"].includes(role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const driver = await User.findById(driverId).select(
      "name drivercode wallet"
    );
    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    let filter = { driver: driverId, "settlement.isSettled": true };
    if (status) {
      filter["settlement.status"] = status;
    }

    const settlements = await Booking.find(filter)
      .select("_id settlement createdAt updatedAt data")
      .sort({ "settlement.settledAt": -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate({
        path: "settlement.settledBy",
        select: "name role",
        model: "Admin",
      });

    const totalSettlements = await Booking.countDocuments(filter);
    const totalSettledAmount = await Booking.aggregate([
      { $match: filter },
      {
        $group: { _id: null, total: { $sum: "$settlement.settlementAmount" } },
      },
    ]);

    res.json({
      success: true,
      driver,
      settlements,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalSettlements / parseInt(limit)),
        totalSettlements,
        limit: parseInt(limit),
      },
      summary: {
        totalSettledAmount: totalSettledAmount[0]?.total || 0,
        currentWalletBalance: driver.wallet?.balance || 0,
      },
    });
  } catch (error) {
    console.error("Get driver settlements error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Reverse/cancel a settlement
 * POST /api/admin/booking/:bookingId/reverse-settlement
 */
export const reverseSettlement = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { role, userId: adminId } = req.user;
    const { reason = "" } = req.body;

    if (!["admin"].includes(role)) {
      // Only admin can reverse
      return res
        .status(403)
        .json({ message: "Only admin can reverse settlements" });
    }

    const booking = await Booking.findById(bookingId).populate({
      path: "driver",
      select: "name wallet",
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!booking.settlement.isSettled) {
      return res.status(400).json({ message: "Booking is not settled" });
    }

    const driver = booking.driver;
    const originalAmount = booking.settlement.settlementAmount;
    const adjustAdminWallet = booking.settlement?.adjustAdminWallet === true;
    const settledByAdminId = booking.settlement?.settledBy || null;
    let adminWalletUpdate = null;
    let adminReversalTxn = null;

    // Reverse the wallet transaction (undo the settlement)
    if (originalAmount !== 0) {
      if (!driver.wallet) driver.wallet = { balance: 0 };

      // Reverse the settlement: opposite of what was done
      driver.wallet.balance += originalAmount; // Undo the original settlement
      await driver.save();

      // Create reversal transaction
      await Transaction.create({
        userId: driver._id,
        fromAdminId: adminId,
        amount: Math.abs(originalAmount),
        type: originalAmount > 0 ? "credit" : "debit", // Opposite of settlement type
        description: `Settlement reversal for booking ${bookingId} - ${reason}`,
        balanceAfter: driver.wallet.balance,
        category: "user_wallet",
      });

      // Also reverse admin wallet if it was adjusted during settlement
      if (adjustAdminWallet && settledByAdminId) {
        const performingAdmin = await Admin.findById(settledByAdminId).select(
          "wallet"
        );
        if (performingAdmin) {
          if (!performingAdmin.wallet) performingAdmin.wallet = { balance: 0 };
          if (originalAmount > 0) {
            // Previously admin wallet was credited; now debit it back
            performingAdmin.wallet.balance -= originalAmount;
            await performingAdmin.save();
            adminReversalTxn = await Transaction.create({
              fromAdminId: adminId,
              adminId: performingAdmin._id,
              amount: originalAmount,
              type: "debit",
              description: `Settlement reversal: Returning amount to driver for booking ${bookingId} - ${reason}`,
              balanceAfter: performingAdmin.wallet.balance,
              category: "admin_wallet",
            });
          } else {
            // Previously admin wallet was debited; now credit it back
            const creditAmt = Math.abs(originalAmount);
            performingAdmin.wallet.balance += creditAmt;
            await performingAdmin.save();
            adminReversalTxn = await Transaction.create({
              fromAdminId: adminId,
              adminId: performingAdmin._id,
              amount: creditAmt,
              type: "credit",
              description: `Settlement reversal: Receiving returned amount for booking ${bookingId} - ${reason}`,
              balanceAfter: performingAdmin.wallet.balance,
              category: "admin_wallet",
            });
          }
          adminWalletUpdate = {
            newBalance: performingAdmin.wallet.balance,
            reversalTransactionId: adminReversalTxn?._id || null,
          };
        }
      }
    }

    // Update settlement status
    booking.settlement.isSettled = false;
    booking.settlement.status = "reversed";
    booking.settlement.reversedAt = new Date();
    booking.settlement.reversedBy = adminId;
    booking.settlement.reversalReason = reason;

    // Revert booking completion if it was marked complete during settlement
    if (booking.status === 1) {
      booking.status = 0;
      booking.completedAt = null;
    }

    await booking.save();

    res.json({
      success: true,
      message: "Settlement reversed successfully",
      reversalDetails: {
        originalAmount,
        reversedAt: booking.settlement.reversedAt,
        reason,
      },
      walletUpdate: {
        driver: { newBalance: driver.wallet.balance },
        admin: adminWalletUpdate,
      },
    });
  } catch (error) {
    console.error("Reverse settlement error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export const getPendingSettlements = async (req, res) => {
  try {
    const { role } = req.user;

    if (!["admin", "subadmin"].includes(role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const pendingSettlements = await Booking.find({
      "settlement.status": "pending",
    })
      .populate({ path: "driver", select: "name drivercode wallet" })
      .populate({ path: "primaryExpense", model: "Expenses" })
      .populate({ path: "receiving", model: "Receiving" })
      .sort({ "settlement.settledAt": -1 });

    const settlementsWithCalc = pendingSettlements.map((booking) => {
      const calculation = calculateSettlementAmounts(booking);
      return {
        booking: {
          _id: booking._id,
          driver: booking.driver,
          settlement: booking.settlement,
          status: booking.status,
        },
        calculation,
        requiresAction:
          calculation.settlementAmount > (booking.driver.wallet?.balance || 0),
      };
    });

    res.json({
      success: true,
      pendingSettlements: settlementsWithCalc,
      count: settlementsWithCalc.length,
    });
  } catch (error) {
    console.error("Get pending settlements error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export default {
  getSettlementPreview,
  processBookingSettlement,
  getDriverSettlements,
  reverseSettlement,
  getPendingSettlements,
};
