// routes/auth.js
import express from "express";
import userController from "../controllers/user.js";
import { authentication } from "../middlewares/auth.js";
import expensesController from "../controllers/expenses.js";
import { getMyUserTransactions, getMyWalletDetails } from "../controllers/wallet.js";

const router = express.Router();


router.get("/get-user-bookings", authentication, userController.getalldriverbooks);
router.post("/create-expenses", authentication, expensesController.postExpenses);
router.get("/get-expenses", authentication, expensesController.getExpenses);
router.get("/get-expenses-by-booking/:bookingId", authentication, expensesController.getExpensesByBookingId);

// Wallet
router.get("/my/wallet", authentication, getMyWalletDetails);
router.get("/my/transactions", authentication, getMyUserTransactions);


export default router;
