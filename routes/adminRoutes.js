import express from "express";
import multer from "multer";
import uploads from "../middlewares/multer.js";

import { authentication } from "../middlewares/auth.js";
import dutyController from "../controllers/duty.js";
import {
  assignDriver,
  dashboard,
  deleteDriver,
  deleteSubAdmin,
  editDriver,
  filterBookings,
  getAllBookingKeys,
  getAllBookings,
  getAllDrivers,
  getAllSubAdmin,
  getDriverBookingById,
  getDriverDetails,
  uploadBookings,
  getBookingDetail,
  updateBookingStatus,
  settleBooking,
  upsertAdminExpense,
  upsertAdminReceiving,
  upsertAdminDutyInfo,
} from "../controllers/admin.js";

import {
  addMoneyToWallet,
  deductMoneyFromWallet,
  getAllTransactions,
  getWalletDetails,
  transferMoneyToUser,
  getUserWalletDetails,
  addMoneyToUserWallet,
  deductMoneyFromUserWallet,
  transferMoneyToAdmin,
  getMyAdminTransactions,
  getUserTransactionsById,
  getSubAdminWalletById,
  addMoneyToSubAdminWallet,
  deductMoneyFromSubAdminWallet,
  getSubAdminWalletTransactions,
  collectMoneyFromDriver,
} from "../controllers/wallet.js";
import { createLabel, getLabels, setBookingLabels } from "../controllers/label.js";
import {
  getSettlementPreview,
  processBookingSettlement,
  getDriverSettlements,
  reverseSettlement,
  getPendingSettlements
} from "../controllers/settlement.js";
import {
  getSettlementDashboard,
  getDriverSettlementAnalytics
} from "../controllers/settlementDashboard.js";
import {
  getReportingDashboard,
  getFinancialAnalytics,
  getDriverPerformanceReport,
  getReportingDashboardDemo
} from "../controllers/reportingDashboard.js";

const upload = multer({ dest: "uploads/" });

const router = express.Router();

// Protected routes — only "admin" and "subadmin" can access
router.get("/dashboard", authentication, dashboard);
router.get("/drivers", authentication, getAllDrivers);
router.put(
  "/update-drivers/:id",
  uploads.single("profilePicture"),
  authentication,
  editDriver
);
router.delete("/delete-driver/:id", authentication, deleteDriver);
router.get("/driver/:id", authentication, getDriverDetails);
router.get("/driver-bookings/:driverId", authentication, getDriverBookingById); // Fetch bookings for a specific driver
router.get("/sub-admins", authentication, getAllSubAdmin); // Fetch all sub-admins
router.post("/bookings-filters", authentication, filterBookings);
router.get(
  "/user-transactions/:userId",
  authentication,
  getUserTransactionsById
);
router.delete("/delete-sub-admins/:id", authentication, deleteSubAdmin); // Assuming you have a function to delete a sub-admin

// Booking routes
router.post(
  "/upload-bookings",
  authentication,
  upload.single("file"),
  uploadBookings
);
router.get("/bookings", authentication, getAllBookings);
router.get("/booking-keys", authentication, getAllBookingKeys);
router.put("/assign-driver", authentication, assignDriver);
router.get("/booking/:id", authentication, getBookingDetail);
router.put("/booking/:id/status", authentication, updateBookingStatus);
router.post("/booking/:id/settle", authentication, settleBooking);
// Admin/Subadmin self-owned expense/receiving/duty upsert
router.put(
  '/update-expense-booking/:bookingId',
  authentication,
  uploads.any(),
  upsertAdminExpense
);
router.put(
  '/update-receiving-booking/:bookingId',
  authentication,
  uploads.any(),
  upsertAdminReceiving
);
router.put('/update-duty-booking/:bookingId', authentication, upsertAdminDutyInfo);

// Duty Information Management - Admin can edit like receiving/expense
router.get('/duty-info', authentication, dutyController.getAllDutyInfo);
router.get('/duty-info/:dutyInfoId', authentication, dutyController.getDutyInfoById);
router.put('/duty-info/:dutyInfoId', authentication, dutyController.adminUpdateDutyInfo);
router.delete('/duty-info/:dutyInfoId', authentication, dutyController.adminDeleteDutyInfo);

// Settlement routes
router.get('/booking-settlement-preview/:bookingId', authentication, getSettlementPreview);
router.post('/booking-settlement-settle/:bookingId', authentication, processBookingSettlement);
router.post('/booking-settlement/:bookingId/reverse-settlement', authentication, reverseSettlement);
router.get('/driver/:driverId/settlements', authentication, getDriverSettlements);
router.get('/settlements/pending', authentication, getPendingSettlements);

// Settlement dashboard routes
router.get('/dashboard-settlements', authentication, getSettlementDashboard);
router.get('/driver-settlement-analytics/:driverId', authentication, getDriverSettlementAnalytics);

// 📊 NEW: Comprehensive Reporting Dashboard Routes
router.get('/reporting-dashboard', authentication, getReportingDashboard);
router.get('/financial-analytics', authentication, getFinancialAnalytics);
router.get('/driver-performance-report', authentication, getDriverPerformanceReport);
router.get('/reporting-dashboard-demo', authentication, getReportingDashboardDemo);

//wallet routes

// 💰 Wallet Routes
router.post("/add-money", authentication, addMoneyToWallet); // Add money to admin wallet
router.post("/deduct-money", authentication, deductMoneyFromWallet); // Deduct from admin wallet
router.get("/transactions", authentication, getAllTransactions); // See all transactions (admin + user)
// router.get("/admin/transaction/:transactionId", getTransactionById); // Get transaction by ID
router.get("/wallet/:adminId", authentication, getWalletDetails);

// Transfers and user wallet views
router.post("/transfer-to-user", authentication, transferMoneyToUser); // Admin/Subadmin -> User (creates debt for driver)
router.post("/collect-from-driver", authentication, collectMoneyFromDriver); // 🆕 NEW: Admin/Subadmin <- Driver (collect money)
router.get("/user-wallet/:userId", authentication, getUserWalletDetails);
router.get(
  "/my-user-transactions/:userId",
  authentication,
  getUserTransactionsById
);
router.post("/user/add-money", authentication, addMoneyToUserWallet); // Admin -> User company advance (creates debt)
router.post("/user/deduct-money", authentication, deductMoneyFromUserWallet); // Admin -> User company payment (reduces debt)
router.post("/transfer-to-admin", authentication, transferMoneyToAdmin); // Admin -> Subadmin/Admin
router.get("/my-admin-transactions", authentication, getMyAdminTransactions);

//sub admin wallet

router.get(
  "/subadmin-wallet/:subAdminId",
  authentication,
  getSubAdminWalletById
);
router.get(
  "/subadmin-wallet-transactions/:subAdminId",
  authentication,
  getSubAdminWalletTransactions
);
router.post("/add-money-subadmin", authentication, addMoneyToSubAdminWallet); // Admin -> Subadmin adjust credit

router.post(
  "/deduct-money-subadmin",
  authentication,
  deductMoneyFromSubAdminWallet
); 

// Label management
router.post('/labels', authentication, createLabel); // create label
router.get('/get-labels', authentication, getLabels); // list labels
router.post('/add-label-booking/:bookingId', authentication, setBookingLabels); // set/add/remove labels on booking

export default router;
