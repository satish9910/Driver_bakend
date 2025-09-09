// controllers/settlement.js
import Booking from "../models/Booking.js";
import User from "../models/user.js";
import Expenses from "../models/expenses.js";
import Receiving from "../models/receiving.js";
import Transaction from "../models/transectionModel.js";

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
  const primaryExpense = booking.primaryExpense || (booking.expenses && booking.expenses[0]);
  if (primaryExpense) {
    const billingSum = (primaryExpense.billingItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const allowancesSum = primaryExpense.totalAllowances || 0;
    expenseTotal = billingSum + allowancesSum;
    expenseBreakdown = {
      billingSum,
      allowancesSum,
      totalExpense: expenseTotal
    };
  }

  // Calculate receiving totals
  if (booking.receiving) {
    const r = booking.receiving;
    const receivingBillingSum = (r.billingItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
    const receivingAllowances = r.totalAllowances || 0;
    const receivedFromCompany = r.receivedFromCompany || 0;
    const receivedFromClient = r.receivedFromClient || 0;
    receivingTotal = receivingBillingSum + receivingAllowances + receivedFromCompany + receivedFromClient;
    receivingBreakdown = {
      billingSum: receivingBillingSum,
      allowancesSum: receivingAllowances,
      receivedFromCompany,
      receivedFromClient,
      totalReceiving: receivingTotal
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
    receivingBreakdown
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

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const booking = await Booking.findById(bookingId)
      .populate({ path: 'driver', select: 'name email mobile drivercode wallet' })
      .populate({ path: 'expenses', model: 'Expenses' })
      .populate({ path: 'primaryExpense', model: 'Expenses' })
      .populate({ path: 'receiving', model: 'Receiving' });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (!booking.driver) {
      return res.status(400).json({ message: 'No driver assigned to this booking' });
    }

    const calculation = calculateSettlementAmounts(booking);
    
    res.json({
      success: true,
      booking: {
        _id: booking._id,
        status: booking.status,
        driver: booking.driver,
        settlement: booking.settlement
      },
      calculation,
      preview: {
        currentWalletBalance: booking.driver.wallet?.balance || 0,
        settlementAction: calculation.settlementAmount > 0 ? 'debit' : calculation.settlementAmount < 0 ? 'credit' : 'none',
        settlementAbsAmount: Math.abs(calculation.settlementAmount),
        projectedWalletBalance: (booking.driver.wallet?.balance || 0) - calculation.settlementAmount
      }
    });
  } catch (error) {
    console.error('Settlement preview error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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
      customSettlementAmount, 
      adminAdjustments = 0, 
      notes = '',
      markCompleted = false,
      forceSettlement = false // Override insufficient balance
    } = req.body;

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const booking = await Booking.findById(bookingId)
      .populate({ path: 'driver', select: 'name email mobile drivercode wallet' })
      .populate({ path: 'expenses', model: 'Expenses' })
      .populate({ path: 'primaryExpense', model: 'Expenses' })
      .populate({ path: 'receiving', model: 'Receiving' });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (!booking.driver) {
      return res.status(400).json({ message: 'No driver assigned to this booking' });
    }

    if (booking.settlement.isSettled) {
      return res.status(400).json({ message: 'Booking already settled' });
    }

    const calculation = calculateSettlementAmounts(booking);
    
    // Use custom amount if provided, otherwise use calculated amount + admin adjustments
    const finalSettlementAmount = customSettlementAmount !== undefined 
      ? Number(customSettlementAmount) 
      : calculation.settlementAmount + Number(adminAdjustments);

    const driver = booking.driver;
    if (!driver.wallet) driver.wallet = { balance: 0 };

    let transaction = null;
    let settlementStatus = 'completed';
    let errorMessage = null;

    // Process wallet adjustment
    if (finalSettlementAmount !== 0) {
      if (finalSettlementAmount > 0) {
        // Driver owes money - debit from wallet
        if (driver.wallet.balance >= finalSettlementAmount || forceSettlement) {
          driver.wallet.balance -= finalSettlementAmount;
          await driver.save();

          transaction = await Transaction.create({
            userId: driver._id,
            fromAdminId: adminId,
            amount: finalSettlementAmount,
            type: 'debit',
            description: `Settlement debit for booking ${bookingId} ${notes ? `- ${notes}` : ''}`,
            balanceAfter: driver.wallet.balance,
            category: 'user_wallet'
          });
        } else {
          if (!forceSettlement) {
            settlementStatus = 'pending';
            errorMessage = 'Insufficient wallet balance for settlement';
          }
        }
      } else {
        // Company owes driver - credit to wallet
        
        const creditAmount = Math.abs(finalSettlementAmount);
        driver.wallet.balance += creditAmount;
        await driver.save();

        transaction = await Transaction.create({
          userId: driver._id,
          fromAdminId: adminId,
          amount: creditAmount,
          type: 'credit',
          description: `Settlement credit for booking ${bookingId} ${notes ? `- ${notes}` : ''}`,
          balanceAfter: driver.wallet.balance,
          category: 'user_wallet'
        });
      }
    }

    // Update booking settlement
    booking.settlement = {
      isSettled: settlementStatus === 'completed',
      settlementAmount: finalSettlementAmount,
      adminAdjustments: Number(adminAdjustments),
      notes,
      settledAt: settlementStatus === 'completed' ? new Date() : null,
      settledBy: adminId,
      settledByRole: role,
      status: settlementStatus,
      calculatedAmount: calculation.settlementAmount,
      transactionId: transaction?._id || null
    };

    if (markCompleted && settlementStatus === 'completed') {
      booking.status = 1;
      booking.completedAt = new Date();
    }

    await booking.save();

    res.json({
      success: true,
      message: settlementStatus === 'completed' ? 'Settlement processed successfully' : 'Settlement marked as pending',
      settlement: {
        status: settlementStatus,
        amount: finalSettlementAmount,
        transactionId: transaction?._id || null,
        errorMessage
      },
      calculation,
      booking: {
        _id: booking._id,
        status: booking.status,
        settlement: booking.settlement
      },
      walletUpdate: {
        previousBalance: (driver.wallet.balance || 0) + (finalSettlementAmount > 0 ? finalSettlementAmount : -Math.abs(finalSettlementAmount)),
        newBalance: driver.wallet.balance
      }
    });
  } catch (error) {
    console.error('Settlement processing error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get settlement history for a driver
 * GET /api/admin/driver/:driverId/settlements
 */
export const getDriverSettlements = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { role } = req.user;
    const { status, limit = 50, page = 1 } = req.query;

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const driver = await User.findById(driverId).select('name drivercode wallet');
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    let filter = { driver: driverId, 'settlement.isSettled': true };
    if (status) {
      filter['settlement.status'] = status;
    }

    const settlements = await Booking.find(filter)
      .select('_id settlement createdAt updatedAt data')
      .sort({ 'settlement.settledAt': -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .populate({ path: 'settlement.settledBy', select: 'name role', model: 'Admin' });

    const totalSettlements = await Booking.countDocuments(filter);
    const totalSettledAmount = await Booking.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: '$settlement.settlementAmount' } } }
    ]);

    res.json({
      success: true,
      driver,
      settlements,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalSettlements / parseInt(limit)),
        totalSettlements,
        limit: parseInt(limit)
      },
      summary: {
        totalSettledAmount: totalSettledAmount[0]?.total || 0,
        currentWalletBalance: driver.wallet?.balance || 0
      }
    });
  } catch (error) {
    console.error('Get driver settlements error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
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
    const { reason = '' } = req.body;

    if (!['admin'].includes(role)) { // Only admin can reverse
      return res.status(403).json({ message: 'Only admin can reverse settlements' });
    }

    const booking = await Booking.findById(bookingId)
      .populate({ path: 'driver', select: 'name wallet' });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (!booking.settlement.isSettled) {
      return res.status(400).json({ message: 'Booking is not settled' });
    }

    const driver = booking.driver;
    const originalAmount = booking.settlement.settlementAmount;

    // Reverse the wallet transaction
    if (originalAmount !== 0) {
      if (!driver.wallet) driver.wallet = { balance: 0 };
      
      // Reverse the operation
      driver.wallet.balance += originalAmount; // Add back if it was debited, subtract if it was credited
      await driver.save();

      // Create reversal transaction
      await Transaction.create({
        userId: driver._id,
        fromAdminId: adminId,
        amount: Math.abs(originalAmount),
        type: originalAmount > 0 ? 'credit' : 'debit',
        description: `Settlement reversal for booking ${bookingId} - ${reason}`,
        balanceAfter: driver.wallet.balance,
        category: 'user_wallet'
      });
    }

    // Update settlement status
    booking.settlement.isSettled = false;
    booking.settlement.status = 'reversed';
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
      message: 'Settlement reversed successfully',
      reversalDetails: {
        originalAmount,
        reversedAt: booking.settlement.reversedAt,
        reason
      },
      walletUpdate: {
        newBalance: driver.wallet.balance
      }
    });
  } catch (error) {
    console.error('Reverse settlement error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export const getPendingSettlements = async (req, res) => {
  try {
    const { role } = req.user;

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const pendingSettlements = await Booking.find({
      'settlement.status': 'pending'
    })
    .populate({ path: 'driver', select: 'name drivercode wallet' })
    .populate({ path: 'primaryExpense', model: 'Expenses' })
    .populate({ path: 'receiving', model: 'Receiving' })
    .sort({ 'settlement.settledAt': -1 });

    const settlementsWithCalc = pendingSettlements.map(booking => {
      const calculation = calculateSettlementAmounts(booking);
      return {
        booking: {
          _id: booking._id,
          driver: booking.driver,
          settlement: booking.settlement,
          status: booking.status
        },
        calculation,
        requiresAction: calculation.settlementAmount > (booking.driver.wallet?.balance || 0)
      };
    });

    res.json({
      success: true,
      pendingSettlements: settlementsWithCalc,
      count: settlementsWithCalc.length
    });
  } catch (error) {
    console.error('Get pending settlements error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export default {
  getSettlementPreview,
  processBookingSettlement,
  getDriverSettlements,
  reverseSettlement,
  getPendingSettlements
};
