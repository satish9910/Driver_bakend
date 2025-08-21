// models/Expenses.js
import mongoose from "mongoose";

// Define a sub-schema for individual fuel expense entries
const fuelExpenseSchema = new mongoose.Schema({
  fuel: { type: String, default: "Petrol" },
  meter: { type: String, default: null},
  location: { type: String, default: null },
  amount: { type: Number, default: 0 },
  date: { type: Date, default: Date.now }
}, { _id: false });


const expenseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
  tripRoute: { type: String, default: null },
  driverCharge: { type: Number, default: 0 },
  cashToll: { type: Number, default: 0 },
  cashParking: { type: Number, default: 0 },
  otherCash: { type: Number, default: 0 },

  fuelExpense: [fuelExpenseSchema],
  totalDriverExpense: { type: Number, default: 0 },

  dutyAmount: { type: Number, default: 0 },
  advanceAmount: { type: Number, default: 0 },
  dutyExpenses: { type: Number, default: 0 },
  advanceFromCompany: { type: Number, default: 0 },
  officeTransfer: { type: Number, default: 0 },

  balanceDriver: { type: Number, default: 0 },
  balanceCompany: { type: Number, default: 0 },

}, { timestamps: true });

const Expenses = mongoose.model("Expenses", expenseSchema);
export default Expenses;
