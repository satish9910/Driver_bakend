// controllers/reportingDashboard.js
import Booking from "../models/Booking.js";
import User from "../models/user.js";
import Admin from "../models/adminModel.js";
import Transaction from "../models/transectionModel.js";
import Expenses from "../models/expenses.js";
import Receiving from "../models/receiving.js";
import DutyInfo from "../models/dutyInfo.js";
import mongoose from "mongoose";

/**
 * Comprehensive Admin Reporting Dashboard
 * GET /api/admin/reporting-dashboard
 */
export const getReportingDashboard = async (req, res) => {
  try {
    const { role } = req.user;

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied - Admin/Sub-admin only' });
    }

    const { 
      dateFrom, 
      dateTo, 
      driverFilter,
      statusFilter,
      includeFinancials = true 
    } = req.query;

    // Date range setup (default to last 30 days)
    const endDate = dateTo ? new Date(dateTo) : new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Build base filter for date range
    const dateFilter = {
      createdAt: { $gte: startDate, $lte: endDate }
    };

    // Parallel execution of all dashboard queries
    const [
      // 1. OVERVIEW STATISTICS
      overviewStats,
      
      // 2. DRIVER PERFORMANCE METRICS
      driverPerformance,
      
      // 3. FINANCIAL SUMMARY
      financialSummary,
      
      // 4. BOOKING ANALYTICS
      bookingAnalytics,
      
      // 5. SETTLEMENT INSIGHTS
      settlementInsights,
      
      // 6. WALLET ANALYTICS
      walletAnalytics,
      
      // 7. OPERATIONAL METRICS
      operationalMetrics,
      
      // 8. RECENT ACTIVITIES
      recentActivities
    ] = await Promise.all([

      // 1. OVERVIEW STATISTICS
      Booking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: null,
            totalBookings: { $sum: 1 },
            completedBookings: { $sum: { $cond: [{ $eq: ['$status', 1] }, 1, 0] } },
            pendingBookings: { $sum: { $cond: [{ $eq: ['$status', 0] }, 1, 0] } },
            settledBookings: { $sum: { $cond: ['$settlement.isSettled', 1, 0] } },
            totalRevenue: { $sum: { $toDouble: { $arrayElemAt: [{ $filter: { input: '$data', cond: { $eq: ['$$this.key', 'Total Amount'] } } }, 0] }.value } },
            avgBookingValue: { $avg: { $toDouble: { $arrayElemAt: [{ $filter: { input: '$data', cond: { $eq: ['$$this.key', 'Total Amount'] } } }, 0] }.value } }
          }
        }
      ]),

      // 2. DRIVER PERFORMANCE METRICS
      User.aggregate([
        {
          $lookup: {
            from: 'bookings',
            localField: '_id',
            foreignField: 'driver',
            as: 'driverBookings'
          }
        },
        {
          $project: {
            name: 1,
            drivercode: 1,
            email: 1,
            wallet: 1,
            isActive: 1,
            totalBookings: { $size: '$driverBookings' },
            completedBookings: {
              $size: {
                $filter: {
                  input: '$driverBookings',
                  cond: { $eq: ['$$this.status', 1] }
                }
              }
            },
            completionRate: {
              $cond: [
                { $gt: [{ $size: '$driverBookings' }, 0] },
                {
                  $multiply: [
                    {
                      $divide: [
                        { $size: { $filter: { input: '$driverBookings', cond: { $eq: ['$$this.status', 1] } } } },
                        { $size: '$driverBookings' }
                      ]
                    },
                    100
                  ]
                },
                0
              ]
            },
            walletBalance: '$wallet.balance'
          }
        },
        {
          $match: {
            totalBookings: { $gt: 0 }
          }
        },
        {
          $sort: { totalBookings: -1 }
        },
        { $limit: 10 }
      ]),

      // 3. FINANCIAL SUMMARY
      Transaction.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: '$category',
            totalAmount: { $sum: '$amount' },
            creditAmount: { 
              $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', 0] }
            },
            debitAmount: { 
              $sum: { $cond: [{ $eq: ['$type', 'debit'] }, '$amount', 0] }
            },
            transactionCount: { $sum: 1 }
          }
        }
      ]),

      // 4. BOOKING ANALYTICS
      Booking.aggregate([
        { $match: dateFilter },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
              day: { $dayOfMonth: '$createdAt' }
            },
            dailyBookings: { $sum: 1 },
            dailyCompletions: { $sum: { $cond: [{ $eq: ['$status', 1] }, 1, 0] } },
            dailyRevenue: { 
              $sum: { 
                $toDouble: { 
                  $arrayElemAt: [
                    { $filter: { input: '$data', cond: { $eq: ['$$this.key', 'Total Amount'] } } }, 
                    0
                  ] 
                }.value 
              } 
            }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
        { $limit: 30 }
      ]),

      // 5. SETTLEMENT INSIGHTS
      Booking.aggregate([
        { 
          $match: { 
            ...dateFilter,
            'settlement.isSettled': true 
          } 
        },
        {
          $lookup: {
            from: 'users',
            localField: 'driver',
            foreignField: '_id',
            as: 'driverInfo'
          }
        },
        {
          $group: {
            _id: '$settlement.status',
            count: { $sum: 1 },
            totalSettlementAmount: { $sum: '$settlement.settlementAmount' },
            avgSettlementAmount: { $avg: '$settlement.settlementAmount' },
            settlements: {
              $push: {
                bookingId: '$_id',
                driverName: { $arrayElemAt: ['$driverInfo.name', 0] },
                settlementAmount: '$settlement.settlementAmount',
                settledAt: '$settlement.settledAt'
              }
            }
          }
        }
      ]),

      // 6. WALLET ANALYTICS
      User.aggregate([
        {
          $group: {
            _id: null,
            totalDrivers: { $sum: 1 },
            totalWalletBalance: { $sum: '$wallet.balance' },
            positiveWallets: { $sum: { $cond: [{ $gt: ['$wallet.balance', 0] }, 1, 0] } },
            negativeWallets: { $sum: { $cond: [{ $lt: ['$wallet.balance', 0] }, 1, 0] } },
            zeroWallets: { $sum: { $cond: [{ $eq: ['$wallet.balance', 0] }, 1, 0] } },
            avgWalletBalance: { $avg: '$wallet.balance' },
            maxWalletBalance: { $max: '$wallet.balance' },
            minWalletBalance: { $min: '$wallet.balance' }
          }
        }
      ]),

      // 7. OPERATIONAL METRICS
      Promise.all([
        DutyInfo.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
        Expenses.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
        Receiving.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
        Admin.countDocuments({ role: 'subadmin' })
      ]).then(([dutyInfoCount, expensesCount, receivingCount, subAdminCount]) => ({
        dutyInfoSubmissions: dutyInfoCount,
        expenseSubmissions: expensesCount,
        receivingEntries: receivingCount,
        totalSubAdmins: subAdminCount
      })),

      // 8. RECENT ACTIVITIES
      Promise.all([
        Transaction.find({ createdAt: { $gte: startDate, $lte: endDate } })
          .populate({ path: 'fromAdminId', select: 'name role', model: 'Admin' })
          .populate({ path: 'userId', select: 'name drivercode', model: 'User' })
          .sort({ createdAt: -1 })
          .limit(10),
        
        Booking.find({ 
          ...dateFilter,
          'settlement.isSettled': true 
        })
          .populate({ path: 'driver', select: 'name drivercode' })
          .populate({ path: 'settlement.settledBy', select: 'name role', model: 'Admin' })
          .sort({ 'settlement.settledAt': -1 })
          .limit(10)
          .select('_id settlement driver')
      ]).then(([recentTransactions, recentSettlements]) => ({
        recentTransactions,
        recentSettlements
      }))
    ]);

    // Format response with comprehensive analytics
    const dashboard = {
      // Meta information
      reportMetadata: {
        generatedAt: new Date(),
        dateRange: { from: startDate, to: endDate },
        reportedBy: req.user.role,
        totalDaysAnalyzed: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
      },

      // Overview statistics
      overview: overviewStats[0] || {
        totalBookings: 0,
        completedBookings: 0,
        pendingBookings: 0,
        settledBookings: 0,
        totalRevenue: 0,
        avgBookingValue: 0
      },

      // Driver insights
      driverInsights: {
        topPerformers: driverPerformance,
        totalActiveDrivers: driverPerformance.length,
        avgCompletionRate: driverPerformance.length > 0 
          ? driverPerformance.reduce((sum, d) => sum + d.completionRate, 0) / driverPerformance.length 
          : 0
      },

      // Financial insights
      financialInsights: {
        transactionSummary: financialSummary,
        walletAnalytics: walletAnalytics[0] || {
          totalDrivers: 0,
          totalWalletBalance: 0,
          positiveWallets: 0,
          negativeWallets: 0,
          zeroWallets: 0,
          avgWalletBalance: 0
        },
        settlementInsights: settlementInsights
      },

      // Booking trends
      bookingTrends: {
        dailyAnalytics: bookingAnalytics,
        totalDaysTracked: bookingAnalytics.length
      },

      // Operational metrics
      operationalMetrics: operationalMetrics,

      // Recent activities
      recentActivities: recentActivities,

      // Key Performance Indicators (KPIs)
      kpis: {
        completionRate: overviewStats[0] ? 
          ((overviewStats[0].completedBookings / overviewStats[0].totalBookings) * 100).toFixed(2) : 0,
        settlementRate: overviewStats[0] ? 
          ((overviewStats[0].settledBookings / overviewStats[0].totalBookings) * 100).toFixed(2) : 0,
        avgRevenuePerBooking: overviewStats[0] ? overviewStats[0].avgBookingValue.toFixed(2) : 0,
        driverUtilization: driverPerformance.length > 0 ? 
          driverPerformance.filter(d => d.completionRate > 80).length / driverPerformance.length * 100 : 0
      },

      // Alerts and warnings
      alerts: {
        lowPerformingDrivers: driverPerformance.filter(d => d.completionRate < 70).length,
        negativeWalletDrivers: walletAnalytics[0] ? walletAnalytics[0].negativeWallets : 0,
        pendingSettlements: overviewStats[0] ? overviewStats[0].completedBookings - overviewStats[0].settledBookings : 0,
        inactiveDrivers: await User.countDocuments({ isActive: false })
      }
    };

    res.json({
      success: true,
      dashboard
    });

  } catch (error) {
    console.error('Reporting dashboard error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error generating reporting dashboard', 
      error: error.message 
    });
  }
};

/**
 * Financial Analytics Report
 * GET /api/admin/financial-analytics
 */
export const getFinancialAnalytics = async (req, res) => {
  try {
    const { role } = req.user;

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { dateFrom, dateTo } = req.query;
    const endDate = dateTo ? new Date(dateTo) : new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const [
      // Revenue analysis
      revenueAnalysis,
      
      // Expense breakdown
      expenseBreakdown,
      
      // Settlement analytics
      settlementAnalytics,
      
      // Cash flow analysis
      cashFlowAnalysis,
      
      // Driver financial performance
      driverFinancialPerformance
    ] = await Promise.all([

      // Revenue analysis from bookings
      Booking.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            monthlyRevenue: { 
              $sum: { 
                $toDouble: { 
                  $arrayElemAt: [
                    { $filter: { input: '$data', cond: { $eq: ['$$this.key', 'Total Amount'] } } }, 
                    0
                  ] 
                }.value 
              } 
            },
            bookingCount: { $sum: 1 },
            completedRevenue: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 1] },
                  { 
                    $toDouble: { 
                      $arrayElemAt: [
                        { $filter: { input: '$data', cond: { $eq: ['$$this.key', 'Total Amount'] } } }, 
                        0
                      ] 
                    }.value 
                  },
                  0
                ]
              }
            }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ]),

      // Expense breakdown
      Expenses.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: null,
            totalExpenses: { $sum: '$totalDriverExpense' },
            totalAllowances: { $sum: '$totalAllowances' },
            avgExpensePerBooking: { $avg: '$totalDriverExpense' },
            expenseCount: { $sum: 1 },
            // Breakdown by allowance types
            dailyAllowanceTotal: { $sum: '$dailyAllowance' },
            outstationAllowanceTotal: { $sum: '$outstationAllowance' },
            nightAllowanceTotal: { $sum: '$nightAllowance' }
          }
        }
      ]),

      // Settlement analytics
      Booking.aggregate([
        { 
          $match: { 
            'settlement.settledAt': { $gte: startDate, $lte: endDate },
            'settlement.isSettled': true 
          } 
        },
        {
          $group: {
            _id: null,
            totalSettlements: { $sum: 1 },
            totalSettlementAmount: { $sum: '$settlement.settlementAmount' },
            avgSettlementAmount: { $avg: '$settlement.settlementAmount' },
            positiveSettlements: { 
              $sum: { $cond: [{ $gt: ['$settlement.settlementAmount', 0] }, 1, 0] } 
            },
            negativeSettlements: { 
              $sum: { $cond: [{ $lt: ['$settlement.settlementAmount', 0] }, 1, 0] } 
            },
            totalPositiveAmount: { 
              $sum: { $cond: [{ $gt: ['$settlement.settlementAmount', 0] }, '$settlement.settlementAmount', 0] } 
            },
            totalNegativeAmount: { 
              $sum: { $cond: [{ $lt: ['$settlement.settlementAmount', 0] }, '$settlement.settlementAmount', 0] } 
            }
          }
        }
      ]),

      // Cash flow analysis from transactions
      Transaction.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: {
              category: '$category',
              type: '$type'
            },
            totalAmount: { $sum: '$amount' },
            transactionCount: { $sum: 1 }
          }
        }
      ]),

      // Driver financial performance
      User.aggregate([
        {
          $lookup: {
            from: 'transactions',
            localField: '_id',
            foreignField: 'userId',
            as: 'transactions'
          }
        },
        {
          $lookup: {
            from: 'bookings',
            localField: '_id',
            foreignField: 'driver',
            as: 'bookings'
          }
        },
        {
          $project: {
            name: 1,
            drivercode: 1,
            walletBalance: '$wallet.balance',
            totalTransactions: { $size: '$transactions' },
            totalBookings: { $size: '$bookings' },
            settledBookings: {
              $size: {
                $filter: {
                  input: '$bookings',
                  cond: '$this.settlement.isSettled'
                }
              }
            },
            totalTransactionValue: { $sum: '$transactions.amount' }
          }
        },
        {
          $match: {
            totalBookings: { $gt: 0 }
          }
        },
        { $sort: { walletBalance: -1 } },
        { $limit: 20 }
      ])
    ]);

    res.json({
      success: true,
      financialAnalytics: {
        reportPeriod: { from: startDate, to: endDate },
        revenue: {
          monthlyBreakdown: revenueAnalysis,
          totalRevenue: revenueAnalysis.reduce((sum, month) => sum + month.monthlyRevenue, 0),
          completedRevenue: revenueAnalysis.reduce((sum, month) => sum + month.completedRevenue, 0)
        },
        expenses: expenseBreakdown[0] || {
          totalExpenses: 0,
          totalAllowances: 0,
          avgExpensePerBooking: 0,
          expenseCount: 0
        },
        settlements: settlementAnalytics[0] || {
          totalSettlements: 0,
          totalSettlementAmount: 0,
          avgSettlementAmount: 0,
          positiveSettlements: 0,
          negativeSettlements: 0
        },
        cashFlow: cashFlowAnalysis,
        driverPerformance: driverFinancialPerformance
      }
    });

  } catch (error) {
    console.error('Financial analytics error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Driver Performance Report
 * GET /api/admin/driver-performance-report
 */
export const getDriverPerformanceReport = async (req, res) => {
  try {
    const { role } = req.user;

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { dateFrom, dateTo, sortBy = 'totalBookings', sortOrder = 'desc' } = req.query;
    const endDate = dateTo ? new Date(dateTo) : new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const driverPerformance = await User.aggregate([
      {
        $lookup: {
          from: 'bookings',
          let: { driverId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$driver', '$$driverId'] },
                createdAt: { $gte: startDate, $lte: endDate }
              }
            }
          ],
          as: 'periodBookings'
        }
      },
      {
        $lookup: {
          from: 'transactions',
          let: { driverId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$driverId'] },
                createdAt: { $gte: startDate, $lte: endDate }
              }
            }
          ],
          as: 'periodTransactions'
        }
      },
      {
        $lookup: {
          from: 'expenses',
          let: { driverId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$userId', '$$driverId'] },
                createdAt: { $gte: startDate, $lte: endDate }
              }
            }
          ],
          as: 'periodExpenses'
        }
      },
      {
        $project: {
          name: 1,
          drivercode: 1,
          email: 1,
          mobile: 1,
          isActive: 1,
          walletBalance: '$wallet.balance',
          
          // Booking metrics
          totalBookings: { $size: '$periodBookings' },
          completedBookings: {
            $size: {
              $filter: {
                input: '$periodBookings',
                cond: { $eq: ['$$this.status', 1] }
              }
            }
          },
          settledBookings: {
            $size: {
              $filter: {
                input: '$periodBookings',
                cond: '$$this.settlement.isSettled'
              }
            }
          },
          
          // Financial metrics
          totalTransactions: { $size: '$periodTransactions' },
          totalExpenseSubmissions: { $size: '$periodExpenses' },
          totalExpenseAmount: { $sum: '$periodExpenses.totalDriverExpense' },
          
          // Performance ratios
          completionRate: {
            $cond: [
              { $gt: [{ $size: '$periodBookings' }, 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      { $size: { $filter: { input: '$periodBookings', cond: { $eq: ['$$this.status', 1] } } } },
                      { $size: '$periodBookings' }
                    ]
                  },
                  100
                ]
              },
              0
            ]
          },
          
          settlementRate: {
            $cond: [
              { $gt: [{ $size: '$periodBookings' }, 0] },
              {
                $multiply: [
                  {
                    $divide: [
                      { $size: { $filter: { input: '$periodBookings', cond: '$$this.settlement.isSettled' } } },
                      { $size: '$periodBookings' }
                    ]
                  },
                  100
                ]
              },
              0
            ]
          }
        }
      },
      {
        $match: {
          $or: [
            { totalBookings: { $gt: 0 } },
            { totalTransactions: { $gt: 0 } }
          ]
        }
      },
      { $sort: sortOptions }
    ]);

    // Calculate summary statistics
    const summary = {
      totalDriversReported: driverPerformance.length,
      avgCompletionRate: driverPerformance.reduce((sum, d) => sum + d.completionRate, 0) / driverPerformance.length || 0,
      avgSettlementRate: driverPerformance.reduce((sum, d) => sum + d.settlementRate, 0) / driverPerformance.length || 0,
      totalBookingsInPeriod: driverPerformance.reduce((sum, d) => sum + d.totalBookings, 0),
      totalCompletedBookings: driverPerformance.reduce((sum, d) => sum + d.completedBookings, 0),
      topPerformers: driverPerformance.slice(0, 5),
      lowPerformers: driverPerformance.filter(d => d.completionRate < 70)
    };

    res.json({
      success: true,
      reportPeriod: { from: startDate, to: endDate },
      summary,
      driverPerformance
    });

  } catch (error) {
    console.error('Driver performance report error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Test/Demo endpoint for reporting dashboard
 * GET /api/admin/reporting-dashboard-demo
 */
export const getReportingDashboardDemo = async (req, res) => {
  try {
    const { role } = req.user;

    if (!['admin', 'subadmin'].includes(role)) {
      return res.status(403).json({ message: 'Access denied - Admin/Sub-admin only' });
    }

    // Simple demo data to verify the endpoint works
    const demoData = {
      success: true,
      message: 'Reporting Dashboard is working correctly!',
      timestamp: new Date(),
      demoStats: {
        totalBookings: await Booking.countDocuments(),
        totalDrivers: await User.countDocuments(),
        totalTransactions: await Transaction.countDocuments(),
        totalAdmins: await Admin.countDocuments()
      },
      systemStatus: 'Active',
      reportingFeatures: [
        'Comprehensive Overview Dashboard',
        'Financial Analytics Report',
        'Driver Performance Report',
        'Real-time KPIs',
        'Advanced Filtering',
        'Export Capabilities'
      ]
    };

    res.json(demoData);
  } catch (error) {
    console.error('Demo dashboard error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Demo endpoint error', 
      error: error.message 
    });
  }
};

export default {
  getReportingDashboard,
  getFinancialAnalytics,
  getDriverPerformanceReport,
  getReportingDashboardDemo
};