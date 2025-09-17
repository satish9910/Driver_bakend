// routes/auth.js
import express from "express";
import userController from "../controllers/user.js";
import { authentication } from "../middlewares/auth.js";
import expensesController from "../controllers/expenses.js";
import dutyController from "../controllers/duty.js";
import { getMyUserTransactions, getMyWalletDetails } from "../controllers/wallet.js";
import { upsertReceiving, getReceivingByBooking } from "../controllers/receiving.js";
import { 
  getMySettlements, 
  getBookingSettlementDetails, 
  getSettlementTransactions 
} from "../controllers/userSettlement.js";
import upload from "../middlewares/multer.js";

const router = express.Router();


router.get("/get-user-bookings", authentication, userController.getalldriverbooks);

// Duty Information - Fill once, shows in both receiving & expense
router.post('/duty-info', authentication, dutyController.upsertDutyInfo);
router.get('/duty-info/booking/:bookingId', authentication, dutyController.getDutyInfoByBooking);
router.get('/duty-info/:dutyInfoId', authentication, dutyController.getDutyInfoById);
router.get('/my-duty-info', authentication, dutyController.getUserDutyInfo);

// Expenses - Updated: No duty fields, shows duty info when filling
router.post(
  "/create-expenses",
  authentication,
  upload.any(),
  expensesController.postExpenses
);
router.get("/get-driver-profile", authentication, userController.getdriverprofile);
router.get("/get-expenses", authentication, expensesController.getExpenses);
router.get("/get-expenses-by-booking/:bookingId", authentication, expensesController.getExpensesByBookingId);
// Booking expense + receiving + stats for a particular booking (driver view)
router.get("/booking/:bookingId/expense-receiving", authentication, userController.getUserExpenseAndRecievings);
// Receiving
router.post(
	'/create-receiving',
	authentication,
	upload.any(),
	upsertReceiving
);
router.get('/receiving/:bookingId', authentication, getReceivingByBooking);

// Wallet
router.get("/my/wallet", authentication, getMyWalletDetails);
router.get("/my-transactions", authentication, getMyUserTransactions);

// Settlement routes for drivers
router.get("/my-settlements", authentication, getMySettlements);
router.get("/booking-settlement/:bookingId", authentication, getBookingSettlementDetails);
router.get("/settlement-transactions", authentication, getSettlementTransactions);


export default router;
