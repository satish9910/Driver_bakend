// controllers/userSettlement.js
import Booking from "../models/Booking.js";
import Transaction from "../models/transectionModel.js";

/**
 * Get driver's settlement history
 * GET /api/user/my-settlements
 */
export const getMySettlements = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { status, limit = 20, page = 1 } = req.query;

    let filter = { driver: userId };
    if (status === 'settled') {
      filter['settlement.isSettled'] = true;
    } else if (status === 'pending') {
      filter['settlement.isSettled'] = false;
      filter.status = 1; // completed bookings
    }

    const settlements = await Booking.find(filter)
      .select('_id settlement status completedAt createdAt data')
      .sort({ 'settlement.settledAt': -1, completedAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const totalCount = await Booking.countDocuments(filter);

    // Calculate settlement amounts for bookings without settlement
    const settlementsWithCalc = await Promise.all(
      settlements.map(async (booking) => {
        let calculatedAmount = booking.settlement.settlementAmount || 0;
        let calculationBreakdown = null;

        // If not settled, calculate what settlement would be
        if (!booking.settlement.isSettled) {
          const bookingWithPopulated = await Booking.findById(booking._id)
            .populate({ path: 'primaryExpense', model: 'Expenses' })
            .populate({ path: 'receiving', model: 'Receiving' });

          let expenseTotal = 0;
          let receivingTotal = 0;

          const primaryExpense = bookingWithPopulated.primaryExpense;
          if (primaryExpense) {
            const billingSum = (primaryExpense.billingItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
            expenseTotal = billingSum + (primaryExpense.totalAllowances || 0);
          }

          if (bookingWithPopulated.receiving) {
            const r = bookingWithPopulated.receiving;
            const receivingBillingSum = (r.billingItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
            receivingTotal = receivingBillingSum + (r.totalAllowances || 0) + (r.receivedFromCompany || 0) + (r.receivedFromClient || 0);
          }

          calculatedAmount = Number((expenseTotal - receivingTotal).toFixed(2));
          calculationBreakdown = {
            expenseTotal,
            receivingTotal,
            difference: calculatedAmount
          };
        }

        return {
          _id: booking._id,
          settlement: booking.settlement,
          status: booking.status,
          completedAt: booking.completedAt,
          createdAt: booking.createdAt,
          calculatedAmount,
          calculationBreakdown,
          bookingReference: booking.data?.find(d => d.key === 'Booking Reference')?.value || booking._id
        };
      })
    );

    // Get summary statistics
    const summary = await Booking.aggregate([
      { $match: { driver: userId } },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: 1 },
          settledBookings: { $sum: { $cond: ['$settlement.isSettled', 1, 0] } },
          totalSettledAmount: { $sum: '$settlement.settlementAmount' },
          pendingSettlements: {
            $sum: { $cond: [{ $and: [{ $eq: ['$status', 1] }, { $ne: ['$settlement.isSettled', true] }] }, 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      settlements: settlementsWithCalc,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit)
      },
      summary: summary[0] || {
        totalBookings: 0,
        settledBookings: 0,
        totalSettledAmount: 0,
        pendingSettlements: 0
      }
    });
  } catch (error) {
    console.error('Get my settlements error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get settlement details for a specific booking
 * GET /api/user/booking/:bookingId/settlement
 */
export const getBookingSettlementDetails = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { bookingId } = req.params;

    const booking = await Booking.findOne({ _id: bookingId, driver: userId })
      .populate({ path: 'primaryExpense', model: 'Expenses' })
      .populate({ path: 'receiving', model: 'Receiving' })
      .populate({ path: 'settlement.settledBy', select: 'name role', model: 'Admin' });

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found or access denied' });
    }

    // Calculate settlement breakdown
    let expenseTotal = 0;
    let receivingTotal = 0;
    let expenseBreakdown = null;
    let receivingBreakdown = null;

    const primaryExpense = booking.primaryExpense;
    if (primaryExpense) {
      const billingSum = (primaryExpense.billingItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
      const allowancesSum = primaryExpense.totalAllowances || 0;
      expenseTotal = billingSum + allowancesSum;
      expenseBreakdown = {
        billingItems: primaryExpense.billingItems || [],
        billingSum,
        allowances: {
          dailyAllowance: primaryExpense.dailyAllowance || 0,
          outstationAllowance: primaryExpense.outstationAllowance || 0,
          earlyStartAllowance: primaryExpense.earlyStartAllowance || 0,
          nightAllowance: primaryExpense.nightAllowance || 0,
          overTime: primaryExpense.overTime || 0,
          sundayAllowance: primaryExpense.sundayAllowance || 0,
          outstationOvernightAllowance: primaryExpense.outstationOvernightAllowance || 0,
          extraDutyAllowance: primaryExpense.extraDutyAllowance || 0
        },
        allowancesSum,
        totalExpense: expenseTotal
      };
    }

    if (booking.receiving) {
      const r = booking.receiving;
      const receivingBillingSum = (r.billingItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
      const receivingAllowances = r.totalAllowances || 0;
      const receivedFromCompany = r.receivedFromCompany || 0;
      const receivedFromClient = r.receivedFromClient || 0;
      receivingTotal = receivingBillingSum + receivingAllowances + receivedFromCompany + receivedFromClient;
      receivingBreakdown = {
        billingItems: r.billingItems || [],
        billingSum: receivingBillingSum,
        allowances: {
          dailyAllowance: r.dailyAllowance || 0,
          outstationAllowance: r.outstationAllowance || 0,
          earlyStartAllowance: r.earlyStartAllowance || 0,
          nightAllowance: r.nightAllowance || 0,
          overTime: r.overTime || 0,
          sundayAllowance: r.sundayAllowance || 0,
          outstationOvernightAllowance: r.outstationOvernightAllowance || 0,
          extraDutyAllowance: r.extraDutyAllowance || 0
        },
        allowancesSum: receivingAllowances,
        receivedFromCompany,
        receivedFromClient,
        totalReceiving: receivingTotal
      };
    }

    const calculatedDifference = Number((expenseTotal - receivingTotal).toFixed(2));

    // Get related transaction if settled
    let settlementTransaction = null;
    if (booking.settlement.isSettled && booking.settlement.transactionId) {
      settlementTransaction = await Transaction.findById(booking.settlement.transactionId);
    }

    res.json({
      success: true,
      booking: {
        _id: booking._id,
        status: booking.status,
        completedAt: booking.completedAt,
        settlement: booking.settlement
      },
      calculation: {
        expenseTotal,
        receivingTotal,
        difference: calculatedDifference,
        expenseBreakdown,
        receivingBreakdown
      },
      settlementTransaction,
      explanation: {
        message: calculatedDifference > 0 
          ? `You have spent ₹${Math.abs(calculatedDifference)} more than received. This amount will be deducted from your wallet.`
          : calculatedDifference < 0 
          ? `You have received ₹${Math.abs(calculatedDifference)} more than spent. This amount will be credited to your wallet.`
          : 'Your expenses and receivings are balanced. No wallet adjustment needed.'
      }
    });
  } catch (error) {
    console.error('Get booking settlement details error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get driver's wallet transactions related to settlements
 * GET /api/user/settlement-transactions
 */
export const getSettlementTransactions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { limit = 20, page = 1 } = req.query;

    const transactions = await Transaction.find({
      userId,
      category: 'user_wallet',
      description: { $regex: 'settlement', $options: 'i' }
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .populate({ path: 'fromAdminId', select: 'name role', model: 'Admin' });

    const totalCount = await Transaction.countDocuments({
      userId,
      category: 'user_wallet',
      description: { $regex: 'settlement', $options: 'i' }
    });

    res.json({
      success: true,
      transactions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get settlement transactions error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export default {
  getMySettlements,
  getBookingSettlementDetails,
  getSettlementTransactions
};
