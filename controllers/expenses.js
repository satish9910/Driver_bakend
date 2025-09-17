// controllers/expenses.js
// controllers/expenses.js
import Expenses from "../models/expenses.js";
import Booking from "../models/Booking.js";
import Receiving from "../models/receiving.js";
import DutyInfo from "../models/dutyInfo.js";
import User from "../models/user.js";
import Transaction from "../models/transectionModel.js";

const postExpenses = async (req, res) => {
  try {
    const userId = req.user.userId;
    const data = req.body;
    const { bookingId } = data;

    console.log("postExpenses data:", data);
    console.log("bookingId:", bookingId);
    console.log("userId:", userId);

    if (!bookingId) {
      return res.status(400).json({ message: "bookingId is required" });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    
    // Ensure current user is the booking's driver (if driver assigned)
    if (booking.driver && booking.driver.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ message: "Not allowed to add expenses to this booking" });
    }

    // Check if duty info exists (required)
    const dutyInfo = await DutyInfo.findOne({ userId, bookingId });
    if (!dutyInfo) {
      return res.status(400).json({ 
        message: 'Duty information must be filled first. Please create duty info before filling expense details.',
        dutyInfoRequired: true
      });
    }

    // Parse billingItems (might come as JSON string from form-data)
      const parseMaybe = (val, fallback) => {
      if (val == null) return fallback;
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
            } catch (e) {
              // Surface parsing issues clearly
              throw new Error("billingItems invalid JSON");
        }
      }
      return val;
    };

    let billingItems = parseMaybe(data.billingItems, []);

    // Attach uploaded images for billing items
    // Multer .any() gives req.files as array
    if (Array.isArray(req.files)) {
      req.files.forEach((f) => {
        const field = f.fieldname || '';
        const match = field.match(/^billingItems\[(\d+)\]\.image$/);
        if (match) {
          const index = parseInt(match[1]);
          if (billingItems[index]) billingItems[index].image = f.path;
        }
      });
    } else if (req.files) {
      // Multer .fields() style fallback
      for (const field in req.files) {
        const filesArr = req.files[field];
        filesArr.forEach((f) => {
          const match = field.match(/^billingItems\[(\d+)\]\.image$/);
          if (match) {
            const index = parseInt(match[1]);
            if (billingItems[index]) billingItems[index].image = f.path;
          }
        });
      }
    }

    billingItems = Array.isArray(billingItems)
      ? billingItems
          .filter((i) => i && i.category && i.amount != null)
          .map((i) => ({
            category: i.category,
            amount: Number(i.amount) || 0,
            image: i.image || null,
            note: i.note || "",
          }))
      : [];

    // Simplified allowances (only essential ones as requested)
    const allowances = {
      dailyAllowance: Number(data.dailyAllowance || 0),
      outstationAllowance: Number(data.outstationAllowance || 0),
      nightAllowance: Number(data.nightAllowance || 0),
    };

    const notes = data.notes || "";

    // Upsert (unique per bookingId + userId)
    let expense = await Expenses.findOne({ bookingId, userId });
    const creating = !expense;
    if (!expense) expense = new Expenses({ bookingId, userId });

    // No duty field validation needed since they're handled separately
    Object.assign(expense, {
      billingItems,
      notes,
      ...allowances,
    });

    // Admin tracking if admin is making changes
    if (req.admin) {
      expense.lastEditedByAdmin = req.admin.adminId;
      expense.lastEditedByRole = req.admin.role;
      expense.lastEditedAt = new Date();
    }

      await expense.save();

    // Link expense to booking
    if (
      !booking.expenses
        ?.map((e) => e.toString())
        .includes(expense._id.toString())
    ) {
      booking.expenses = booking.expenses || [];
      booking.expenses.push(expense._id);
    }
    booking.primaryExpense = expense._id;
    await booking.save();

    const billingSum = billingItems.reduce((s, i) => s + i.amount, 0);
    const totalDistance = dutyInfo.totalKm || 0; // Get from duty info
    const totalExpense = billingSum + (expense.totalAllowances || 0);

    res.json({
      message: creating ? "Expenses created" : "Expenses updated",
      expense,
      dutyInfo: {
        totalKm: dutyInfo.totalKm,
        totalHours: dutyInfo.totalHours,
        totalDays: dutyInfo.totalDays,
        formattedDuration: dutyInfo.formattedDuration,
        dateRange: dutyInfo.dateRange,
        timeRange: dutyInfo.timeRange,
        dutyType: dutyInfo.dutyType
      },
      totals: {
        billingSum,
        totalAllowances: expense.totalAllowances,
        totalExpense,
        totalDistance,
      },
    });
  } catch (err) {
    console.error("Error upserting expenses:", err);
      if (err.message === 'billingItems invalid JSON') {
        return res.status(400).json({ message: err.message });
      }
      res.status(500).json({ error: "Server error", details: err.message });
  }
};

const getExpenses = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date, limit = 20 } = req.query;
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
      .populate({ path: "userId", select: "name email mobile" });

    res.status(200).json({ expenses });
  } catch (err) {
    console.error("Error fetching expenses:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const getExpensesByBookingId = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.userId;
    
    const expense = await Expenses.findOne({ bookingId, userId }).populate({
      path: "userId",
      select: "name email mobile",
    });
    
    const dutyInfo = await DutyInfo.findOne({ bookingId, userId });
    
    if (!expense) {
      return res.status(200).json({ 
        expense: null, 
        dutyInfo: dutyInfo ? {
          ...dutyInfo.toObject(),
          calculations: {
            totalKm: dutyInfo.totalKm,
            totalHours: dutyInfo.totalHours,
            totalDays: dutyInfo.totalDays,
            formattedDuration: dutyInfo.formattedDuration,
            dateRange: dutyInfo.dateRange,
            timeRange: dutyInfo.timeRange
          }
        } : null,
        totals: null,
        message: dutyInfo ? 'Duty information found but no expense record yet.' : 'Duty information not found. Please create duty info first.'
      });
    }

    // Compute expense side totals
    const billingSum = (expense.billingItems || []).reduce(
      (s, i) => s + (Number(i.amount) || 0),
      0
    );
    const totalAllowances = expense.totalAllowances || 0;
    const totalExpense = billingSum + totalAllowances;

    // Fetch receiving for combined summary
    const receiving = await Receiving.findOne({ bookingId, userId });
    let receivingTotals = null;
    let difference = null;
    if (receiving) {
      const receivingBillingSum = (receiving.billingItems || []).reduce(
        (s, i) => s + (Number(i.amount) || 0),
        0
      );
      const receivingAllowances = receiving.totalAllowances || 0;
      const totalReceiving = receivingBillingSum + receivingAllowances;
      receivingTotals = {
        receivingBillingSum,
        receivingAllowances,
        totalReceiving,
      };
      difference = Number((totalExpense - totalReceiving).toFixed(2));
    }

    res.status(200).json({
      expense,
      dutyInfo: dutyInfo ? {
        ...dutyInfo.toObject(),
        calculations: {
          totalKm: dutyInfo.totalKm,
          totalHours: dutyInfo.totalHours,
          totalDays: dutyInfo.totalDays,
          formattedDuration: dutyInfo.formattedDuration,
          dateRange: dutyInfo.dateRange,
          timeRange: dutyInfo.timeRange
        }
      } : null,
      totals: {
        billingSum,
        totalAllowances,
        totalExpense,
        receiving: receivingTotals,
        difference,
      },
      message: dutyInfo ? 'Data retrieved successfully' : 'Duty information not found. Please create duty info first.'
    });
  } catch (err) {
    console.error("Error fetching expenses by booking ID:", err);
    res.status(500).json({ error: "Server error" });
  }
};

export default {
  postExpenses,
  getExpenses,
  getExpensesByBookingId,
};
