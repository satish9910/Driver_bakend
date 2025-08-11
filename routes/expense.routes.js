// routes/auth.js
import express from "express";
import expensesController from "../controllers/expenses.js";
import { authentication } from "../middlewares/auth.js";

const router = express.Router();

router.post("/create-expenses", authentication, expensesController.postExpenses);
router.get("/get-expenses", authentication, expensesController.getExpenses);


export default router;
