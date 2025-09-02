// routes/auth.js
import express from "express";
import userController from "../controllers/user.js";
import { authentication } from "../middlewares/auth.js";
import expensesController from "../controllers/expenses.js";
import { getMyUserTransactions, getMyWalletDetails } from "../controllers/wallet.js";
import { upsertReceiving, getReceivingByBooking } from "../controllers/receiving.js";
import upload from "../middlewares/multer.js";

const router = express.Router();


router.get("/get-user-bookings", authentication, userController.getalldriverbooks);
// Dynamic field pattern for multiple billing & fuel slips: billingItems[0].image, fuelExpense[0].image, etc.
router.post(
	"/create-expenses",
	authentication,
	upload.fields([
		{ name: 'billingItems[0].image' },
		{ name: 'billingItems[1].image' },
		{ name: 'billingItems[2].image' },
		{ name: 'fuelExpense[0].image' },
		{ name: 'fuelExpense[1].image' },
		{ name: 'fuelExpense[2].image' }
	]),
	expensesController.postExpenses
);
router.get("/get-expenses", authentication, expensesController.getExpenses);
router.get("/get-expenses-by-booking/:bookingId", authentication, expensesController.getExpensesByBookingId);
// Receiving
router.post('/create-receiving', authentication, upsertReceiving);
router.get('/receiving/:bookingId', authentication, getReceivingByBooking);

// Wallet

router.get("/my/wallet", authentication, getMyWalletDetails);
router.get("/my/transactions", authentication, getMyUserTransactions);


export default router;
