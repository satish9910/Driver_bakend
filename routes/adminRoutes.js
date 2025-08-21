import express from "express";
import multer from "multer";
import uploads from "../middlewares/multer.js";

import { authentication } from "../middlewares/auth.js";
import {
  assignDriver,
  dashboard,
  deleteDriver,
  deleteSubAdmin,
  editDriver,
  getAllBookings,
  getAllDrivers,
  getAllSubAdmin,
  getDriverDetails,
  uploadBookings,
} from "../controllers/admin.js";
import { addMoneyToWallet, deductMoneyFromWallet, getAllTransactions, getWalletDetails, transferMoneyToUser, getUserWalletDetails, getMyUserTransactions, addMoneyToUserWallet, deductMoneyFromUserWallet, transferMoneyToAdmin, getMyAdminTransactions } from "../controllers/wallet.js";

const upload = multer({ dest: "uploads/" });

const router = express.Router();

// Protected routes — only "admin" and "subadmin" can access
router.get("/dashboard", authentication, dashboard);
router.get("/drivers", authentication, getAllDrivers);
router.put("/update-drivers/:id", uploads.single("profilePicture"), authentication, editDriver);
router.delete("/delete-driver/:id", authentication, deleteDriver);
router.get("/driver/:id", authentication, getDriverDetails);
router.get("/sub-admins", authentication, getAllSubAdmin); // Fetch all sub-admins
router.delete("/delete-sub-admins/:id", authentication, deleteSubAdmin); // Assuming you have a function to delete a sub-admin

// Booking routes
router.post(
  "/upload-bookings",
  authentication,
  upload.single("file"),
  uploadBookings
);
router.get("/bookings", authentication, getAllBookings);
router.put("/assign-driver", authentication, assignDriver);

//wallet routes

// 💰 Wallet Routes
router.post("/add-money", authentication, addMoneyToWallet);          // Add money to admin wallet
router.post("/deduct-money", authentication, deductMoneyFromWallet);  // Deduct from admin wallet
router.get("/transactions", authentication, getAllTransactions);      // See all transactions (admin + user)
// router.get("/admin/transaction/:transactionId", getTransactionById); // Get transaction by ID
router.get('/wallet/:adminId', authentication, getWalletDetails);

// Transfers and user wallet views
router.post('/transfer-to-user', authentication, transferMoneyToUser); // Admin/Subadmin -> User
router.get('/user-wallet/:userId', authentication, getUserWalletDetails);
router.get('/my-user-transactions', authentication, getMyUserTransactions);
router.post('/user/add-money', authentication, addMoneyToUserWallet);     // Admin -> User adjust credit
router.post('/user/deduct-money', authentication, deductMoneyFromUserWallet); // Admin -> User adjust debit
router.post('/transfer-to-admin', authentication, transferMoneyToAdmin);   // Admin -> Subadmin/Admin
router.get('/my-admin-transactions', authentication, getMyAdminTransactions);

export default router;
