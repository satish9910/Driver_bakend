import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Expenses from "../models/expenses.js";
import Booking from "../models/Booking.js";

const postExpenses = async (req, res) => {
  try {
    const {
      driverCharge = 0,
      bookingId,
      cashToll = 0,
      tripRoute = null,
      cashParking = 0,
      otherCash = 0,
      fuelExpense = [],
      dutyAmount = 0,
      advanceAmount = 0,
      dutyExpenses = 0,
      advanceFromCompany = 0,
      officeTransfer = 0,
      balanceDriver = 0,
      balanceCompany = 0,
    } = req.body;

    // Sum all fuel expenses
    const totalFuelAmount = fuelExpense.reduce(
      (acc, item) => acc + (item.amount || 0),
      0
    );

    // 👇 Add dutyExpenses to totalDriverExpense
    const totalDriverExpense =
      driverCharge +
      cashToll +
      cashParking +
      otherCash +
      totalFuelAmount +
      dutyExpenses;

    const expense = new Expenses({
      userId: req.user.userId,
      bookingId,
      driverCharge,
      cashToll,
      tripRoute,
      cashParking,
      otherCash,
      fuelExpense,
      totalDriverExpense,
      dutyAmount,
      advanceAmount,
      dutyExpenses,
      advanceFromCompany,
      officeTransfer,
      balanceDriver,
      balanceCompany,
    });

    await expense.save();

        // 👇 Link expense to the booking
    await Booking.findByIdAndUpdate(
      bookingId,
      { $push: { expenses: expense._id } },
      { new: true }
    );


    res.status(201).json({
      message: "Expense created successfully",
      expense,
    });
  } catch (err) {
    console.error("Error creating expense:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const getExpenses = async (req, res) => {
  try {
    console.log('getting expensed');
    
    const userId = req.user.userId;
    const { date, limit = 20 } = req.query;

    // Build query
    const query = { userId };

    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query.createdAt = { $gte: start, $lte: end };
    }

    const expenses = await Expenses.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate({
        path: "userId",
        select: "name email mobile" // only include required user fields
      });

      // console.log('expenses', expenses);
      

    res.status(200).json({ expenses });
  } catch (err) {
    console.error("Error fetching expenses:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// getexpensesbybookingid

const getExpensesByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const expenses = await Expenses.find({ bookingId })
      .populate({
        path: "userId",
        select: "name email mobile" // only include required user fields
      });

    res.status(200).json({ expenses });
  } catch (err) {
    console.error("Error fetching expenses by booking ID:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const expensesController = {
  postExpenses,
  getExpenses,
  getExpensesByBookingId
};

export default expensesController;