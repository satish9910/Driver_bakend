// controllers/settlementDashboard.js
import Booking from "../models/Booking.js";
import User from "../models/user.js";
import Transaction from "../models/transectionModel.js";
import mongoose from "mongoose";

/**
 * Get comprehensive settlement dashboard data
 * GET /api/admin/dashboard/settlements
 */
export const getSettlementDashboard = async (req, res) => {
  try {
    const { role } = req.user;

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Parallel aggregation queries for dashboard stats
    const [
      settlementStats,
      pendingBookings,
      recentSettlements,
      driverWalletStats,
      monthlySettlementTrends
    ] = await Promise.all([
      // Settlement statistics
      Booking.aggregate([
        {
          $group: {
            _id: '$settlement.status',
            count: { $sum: 1 },
            totalAmount: { $sum: '$settlement.settlementAmount' }
          }
        }
      ]),

      // Bookings ready for settlement (completed but not settled)
      Booking.find({
        status: 1, // completed
        $or: [
          { 'settlement.isSettled': false },
          { 'settlement.isSettled': { $exists: false } }
        ]
      })
      .populate({ path: 'driver', select: 'name drivercode wallet' })
      .populate({ path: 'primaryExpense', model: 'Expenses' })
      .populate({ path: 'receiving', model: 'Receiving' })
      .limit(10)
      .sort({ completedAt: -1 }),

      // Recent settlements
      Booking.find({
        'settlement.isSettled': true
      })
      .populate({ path: 'driver', select: 'name drivercode' })
      .populate({ path: 'settlement.settledBy', select: 'name role', model: 'Admin' })
      .sort({ 'settlement.settledAt': -1 })
      .limit(10)
      .select('_id settlement driver'),

      // Driver wallet summary
      User.aggregate([
        {
          $group: {
            _id: null,
            totalDrivers: { $sum: 1 },
            totalWalletBalance: { $sum: '$wallet.balance' },
            avgWalletBalance: { $avg: '$wallet.balance' },
            negativeWallets: {
              $sum: { $cond: [{ $lt: ['$wallet.balance', 0] }, 1, 0] }
            }
          }
        }
      ]),

      // Monthly settlement trends (last 6 months)
      Booking.aggregate([
        {
          $match: {
            'settlement.settledAt': {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 6))
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$settlement.settledAt' },
              month: { $month: '$settlement.settledAt' }
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$settlement.settlementAmount' },
            avgAmount: { $avg: '$settlement.settlementAmount' }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);

    // Format settlement statistics
    const formattedStats = {
      total: 0,
      completed: 0,
      pending: 0,
      reversed: 0,
      totalAmount: 0,
      completedAmount: 0
    };

    settlementStats.forEach(stat => {
      formattedStats.total += stat.count;
      formattedStats.totalAmount += stat.totalAmount || 0;
      
      switch (stat._id) {
        case 'completed':
          formattedStats.completed = stat.count;
          formattedStats.completedAmount = stat.totalAmount || 0;
          break;
        case 'pending':
          formattedStats.pending = stat.count;
          break;
        case 'reversed':
          formattedStats.reversed = stat.count;
          break;
      }
    });

    // Calculate settlement amounts for pending bookings
    const pendingWithCalculations = pendingBookings.map(booking => {
      let expenseTotal = 0;
      let receivingTotal = 0;

      const primaryExpense = booking.primaryExpense || (booking.expenses && booking.expenses[0]);
      if (primaryExpense) {
        const billingSum = (primaryExpense.billingItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
        expenseTotal = billingSum + (primaryExpense.totalAllowances || 0);
      }

      if (booking.receiving) {
        const r = booking.receiving;
        const receivingBillingSum = (r.billingItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
        receivingTotal = receivingBillingSum + (r.totalAllowances || 0) + (r.receivedFromCompany || 0) + (r.receivedFromClient || 0);
      }

      const difference = Number((expenseTotal - receivingTotal).toFixed(2));
      const driverWalletBalance = booking.driver?.wallet?.balance ?? 0;

      return {
        _id: booking._id,
        driver: booking.driver || null,
        calculatedSettlement: difference,
        canSettle: driverWalletBalance >= difference || difference <= 0,
        completedAt: booking.completedAt,
        missingDriver: !booking.driver
      };
    });

    res.json({
      success: true,
      dashboard: {
        statistics: formattedStats,
        pendingSettlements: pendingWithCalculations,
        recentSettlements,
        driverWalletSummary: driverWalletStats[0] || {
          totalDrivers: 0,
          totalWalletBalance: 0,
          avgWalletBalance: 0,
          negativeWallets: 0
        },
        monthlyTrends: monthlySettlementTrends,
        alerts: {
          pendingCount: pendingWithCalculations.length,
          negativeWalletCount: driverWalletStats[0]?.negativeWallets || 0,
          highValuePending: pendingWithCalculations.filter(p => Math.abs(p.calculatedSettlement) > 10000).length
        }
      }
    });
  } catch (error) {
    console.error('Settlement dashboard error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};




/**
 * Get driver-specific settlement analytics
 * GET /api/admin/driver/:driverId/settlement-analytics
 */
export const getDriverSettlementAnalytics = async (req, res) => {
  try {
    const { driverId } = req.params;
    const { role } = req.user;

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const driver = await User.findById(driverId).select('name drivercode wallet');
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    const [
      settlementHistory,
      walletTransactions,
      bookingStats
    ] = await Promise.all([
      // Settlement history with trends
      Booking.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(driverId), 'settlement.isSettled': true } },
        {
          $group: {
            _id: {
              year: { $year: '$settlement.settledAt' },
              month: { $month: '$settlement.settledAt' }
            },
            count: { $sum: 1 },
            totalSettled: { $sum: '$settlement.settlementAmount' },
            avgSettlement: { $avg: '$settlement.settlementAmount' }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 }
      ]),

      // Recent wallet transactions
      Transaction.find({
        userId: driverId,
        category: 'user_wallet'
      })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate({ path: 'fromAdminId', select: 'name role', model: 'Admin' }),

      // Booking statistics
      Booking.aggregate([
        { $match: { driver: new mongoose.Types.ObjectId(driverId) } },
        {
          $group: {
            _id: null,
            totalBookings: { $sum: 1 },
            completedBookings: { $sum: { $cond: [{ $eq: ['$status', 1] }, 1, 0] } },
            settledBookings: { $sum: { $cond: ['$settlement.isSettled', 1, 0] } },
            totalSettlementAmount: { $sum: '$settlement.settlementAmount' },
            avgSettlementAmount: { $avg: '$settlement.settlementAmount' }
          }
        }
      ])
    ]);

    res.json({
      success: true,
      driver,
      analytics: {
        settlementTrends: settlementHistory,
        recentTransactions: walletTransactions,
        bookingStatistics: bookingStats[0] || {
          totalBookings: 0,
          completedBookings: 0,
          settledBookings: 0,
          totalSettlementAmount: 0,
          avgSettlementAmount: 0
        },
        currentWalletBalance: driver.wallet?.balance || 0
      }
    });
  } catch (error) {
    console.error('Driver settlement analytics error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export default {
  getSettlementDashboard,
  getDriverSettlementAnalytics
};
