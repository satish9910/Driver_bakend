// controllers/expenses.js
import Expenses from "../models/expenses.js";
import Booking from "../models/Booking.js";
import Receiving from "../models/receiving.js";
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

    // Parse billingItems (might come as JSON string from form-data)
    const parseMaybe = (val, fallback) => {
      
      if (val == null) return fallback;
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return fallback;
        }
      }
      return val;
    };

    let billingItems = parseMaybe(data.billingItems, []);

    // Attach uploaded images for billing items
    if (req.files) {
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

    // Duty fields
    const dutyStartDate = data.dutyStartDate
      ? new Date(data.dutyStartDate)
      : null;
    const dutyEndDate = data.dutyEndDate ? new Date(data.dutyEndDate) : null;
    const dutyStartTime = data.dutyStartTime || null;
    const dutyEndTime = data.dutyEndTime || null;
    const dutyStartKm =
      data.dutyStartKm !== undefined ? Number(data.dutyStartKm) : null;
    const dutyEndKm =
      data.dutyEndKm !== undefined ? Number(data.dutyEndKm) : null;
    const dutyType = data.dutyType || null;

    // Allowances
    const allowances = {
      dailyAllowance: Number(data.dailyAllowance || 0),
      outstationAllowance: Number(data.outstationAllowance || 0),
      earlyStartAllowance: Number(data.earlyStartAllowance || 0),
      nightAllowance: Number(data.nightAllowance || 0),
      overTime: Number(data.overTime || 0),
      sundayAllowance: Number(data.sundayAllowance || 0),
      outstationOvernightAllowance: Number(
        data.outstationOvernightAllowance || 0
      ),
      extraDutyAllowance: Number(data.extraDutyAllowance || 0),
    };

    const notes = data.notes || "";

    // Upsert (unique per bookingId + userId)
    let expense = await Expenses.findOne({ bookingId, userId });
    const creating = !expense;
    if (!expense) expense = new Expenses({ bookingId, userId });

    // On creation enforce mandatory duty fields (schema requires them). Provide clearer messages.
    if (creating) {
      const missing = [];
      if (!dutyStartDate) missing.push("dutyStartDate");
      if (!dutyStartTime) missing.push("dutyStartTime");
      if (!dutyEndDate) missing.push("dutyEndDate");
      if (!dutyEndTime) missing.push("dutyEndTime");
      if (dutyStartKm == null) missing.push("dutyStartKm");
      if (dutyEndKm == null) missing.push("dutyEndKm");
      if (!dutyType) missing.push("dutyType");
      if (missing.length) {
        return res
          .status(400)
          .json({ message: "Missing required fields", missing });
      }
    }

    Object.assign(expense, {
      dutyStartDate: dutyStartDate ?? expense.dutyStartDate,
      dutyEndDate: dutyEndDate ?? expense.dutyEndDate,
      dutyStartTime: dutyStartTime ?? expense.dutyStartTime,
      dutyEndTime: dutyEndTime ?? expense.dutyEndTime,
      dutyStartKm: dutyStartKm != null ? dutyStartKm : expense.dutyStartKm,
      dutyEndKm: dutyEndKm != null ? dutyEndKm : expense.dutyEndKm,
      dutyType: dutyType ?? expense.dutyType,
      billingItems,
      notes,
      ...allowances,
    });

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
    const totalDistance =
      expense.dutyStartKm != null && expense.dutyEndKm != null
        ? expense.dutyEndKm - expense.dutyStartKm
        : null;
  const totalExpense = billingSum + (expense.totalAllowances || 0);

    // Attempt automatic reconciliation only if a receiving exists for this booking/user
    let reconciliation = null;
    const receiving = await Receiving.findOne({ bookingId, userId });
    let totalReceivingSummary = null;
    if (receiving) {
      const expenseBillingSum = billingSum; // already computed
      const receivingBillingSum = (receiving.billingItems || []).reduce(
        (s, i) => s + (i.amount || 0),
        0
      );
      const totalExpense = expenseBillingSum + (expense.totalAllowances || 0);
      const totalReceiving =
        receivingBillingSum +
        (receiving.totalAllowances || 0) +
        (receiving.receivedFromCompany || 0) +
        (receiving.receivedFromClient || 0);
      totalReceivingSummary = {
        receivingBillingSum,
        receivingAllowances: receiving.totalAllowances || 0,
        receivedFromCompany: receiving.receivedFromCompany || 0,
        receivedFromClient: receiving.receivedFromClient || 0,
        totalReceiving,
      };

      const difference = Number((totalExpense - totalReceiving).toFixed(2));

      // Adjust wallet if difference non-zero

      if (difference !== 0) {
        const user = await User.findById(userId);
        if (user) {
          if (!user.wallet) user.wallet = { balance: 0 };
          let txn = null;
          if (difference > 0) {
            // credit
            user.wallet.balance += difference;
            await user.save();
            txn = await Transaction.create({
              userId: user._id,
              amount: difference,
              type: "credit",
              description: `Auto reconciliation credit for booking ${bookingId}`,
              balanceAfter: user.wallet.balance,
              category: "user_wallet",
            });
            reconciliation = {
              action: "credit",
              difference,
              transactionId: txn._id,
            };
          } else {
            // difference < 0 => debit attempt

            const debitAmt = Math.abs(difference);
            if (user.wallet.balance >= debitAmt) {
              user.wallet.balance -= debitAmt;
              await user.save();
              txn = await Transaction.create({
                userId: user._id,
                amount: debitAmt,
                type: "debit",
                description: `Auto reconciliation debit for booking ${bookingId}`,
                balanceAfter: user.wallet.balance,
                category: "user_wallet",
              });
              reconciliation = {
                action: "debit",
                difference,
                transactionId: txn._id,
              };
            } else {
              reconciliation = {
                action: "debit_pending",
                difference,
                reason: "Insufficient wallet balance",
              };
            }
          }
        }
      } else {
        reconciliation = { action: "none", difference: 0 };
      }
    }

    res.json({
      message: creating ? "Expenses created" : "Expenses updated",
      expense,
      totals: {
        billingSum,
        totalAllowances: expense.totalAllowances,
  totalExpense,
  totalReceiving: totalReceivingSummary,
        totalDistance,
      },
      reconciliation,
    });
  } catch (err) {
    console.error("Error upserting expenses:", err);
    res.status(500).json({ error: "Server error" });
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
    if (!expense) return res.status(200).json({ expense: null, totals: null });

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
      const receivedFromCompany = receiving.receivedFromCompany || 0;
      const receivedFromClient = receiving.receivedFromClient || 0;
      const totalReceiving =
        receivingBillingSum +
        receivingAllowances +
        receivedFromCompany +
        receivedFromClient;
      receivingTotals = {
        receivingBillingSum,
        receivingAllowances,
        receivedFromCompany,
        receivedFromClient,
        totalReceiving,
      };
      difference = Number((totalExpense - totalReceiving).toFixed(2));
    }

    res.status(200).json({
      expense,
      totals: {
        billingSum,
        totalAllowances,
        totalExpense,
        receiving: receivingTotals,
        difference,
      },
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
