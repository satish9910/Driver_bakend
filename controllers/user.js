import User from "../models/user.js";
import Booking from "../models/Booking.js";
import Expenses from "../models/expenses.js";
import Receiving from "../models/receiving.js";
import DutyInfo from "../models/dutyInfo.js";

const getalldriverbooks = (req, res) => {
  console.log("Fetching filtered driver bookings for user:", req.user.userId);
  const allowedKeys = new Set([
    "Duty Id",
    "Passengers",
    "Passenger Phone Numbers",
    "From city",
    "To city",
    "Start Date",
    "End Date",
    "Reporting Address",
    "Drop Address",
    "Driver",
    "Driver Phone Number",
    "Driver Code",
    "Duty Type",
  ]);

  Booking.find({ driver: req.user.userId })
    .populate("driver", "name email mobile drivercode vehicleNumber")
    .sort({ createdAt: -1 })
    .then((bookings) => {
      const filtered = bookings.map((b) => {
        const filteredData = (b.data || []).filter((d) => allowedKeys.has(d.key));
        return {
          _id: b._id,
          driver: b.driver ? {
            _id: b.driver._id,
            name: b.driver.name,
            email: b.driver.email,
            drivercode: b.driver.drivercode,
            mobile: b.driver.mobile,
            vehicleNumber: b.driver.vehicleNumber || null,
          } : null,
          data: filteredData,
            status: b.status,
            settlement: b.settlement ? {
              isSettled: b.settlement.isSettled,
              settlementAmount: b.settlement.settlementAmount,
              status: b.settlement.status,
              action: b.settlement.action,
              settledAt: b.settlement.settledAt || null,
            } : null,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        };
      });

      res.status(200).json({
        success: true,
        count: filtered.length,
        bookings: filtered,
      });
    })
    .catch((error) => {
      console.error("Error fetching driver bookings:", error);
      res.status(500).json({ success: false, message: "Server error" });
    });
};





 const getdriverprofile = (req, res) => {
  console.log("Fetching driver profile for user:", req.user.userId);
  User.findById(req.user.userId)
    .select("-password") // Exclude password field
    .then((user) => {
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      res.status(200).json({ success: true, user });
    })
    .catch((error) => {
      console.error("Error fetching driver profile:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  );
};

// Get a particular booking's expense, receiving and computed stats (for the logged-in driver)
const getUserExpenseAndRecievings = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const driverId = req.user.userId;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: "bookingId is required" });
    }

    // Ensure the booking belongs to this driver
    const booking = await Booking.findById(bookingId)
      .populate({ path: "driver", select: "name email mobile drivercode wallet" });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    if (String(booking.driver?._id) !== String(driverId)) {
      return res.status(403).json({ success: false, message: "Access denied: not your booking" });
    }

    // Fetch expense, receiving, and duty info separately according to updated models
    const [expenseDoc, receivingDoc, dutyInfo] = await Promise.all([
      Expenses.findOne({ bookingId, userId: driverId }),
      Receiving.findOne({ bookingId, userId: driverId }),
      DutyInfo.findOne({ bookingId, userId: driverId })
    ]);

    // Calculate expense totals
    const expenseBilling = (expenseDoc?.billingItems || []).reduce(
      (s, i) => s + (Number(i.amount) || 0),
      0
    );
    const expenseAllowances = Number(expenseDoc?.totalAllowances || 0);
    const expenseTotal = Number((expenseBilling + expenseAllowances).toFixed(2));

    // Calculate receiving totals (updated to use new totalReceivingAmount)
    const receivingBilling = (receivingDoc?.billingItems || []).reduce(
      (s, i) => s + (Number(i.amount) || 0),
      0
    );
    const receivingAmount = Number(receivingDoc?.totalReceivingAmount || 0);
    const receivingTotal = Number((receivingBilling + receivingAmount).toFixed(2));

    const difference = Number((expenseTotal - receivingTotal).toFixed(2));
    const settlementHint = difference > 0 ? "driver_owes" : difference < 0 ? "company_owes" : "settled";

    // Extract a few common keys for convenience
    const keyMap = {};
    (booking.data || []).forEach((kv) => {
      if (kv?.key) keyMap[kv.key] = kv.value;
    });

    return res.status(200).json({
      success: true,
      booking: {
        _id: booking._id,
        status: booking.status,
        dutyId: keyMap["Duty Id"] || "",
        customer: keyMap["Customer"] || "",
        fromCity: keyMap["From city"] || "",
        toCity: keyMap["To city"] || "",
        startDate: keyMap["Start Date"] || "",
      },
      dutyInfo: dutyInfo
        ? {
            totalKm: dutyInfo.totalKm,
            totalHours: dutyInfo.totalHours,
            totalDays: dutyInfo.totalDays,
            formattedDuration: dutyInfo.formattedDuration,
            dateRange: dutyInfo.dateRange,
            timeRange: dutyInfo.timeRange,
            dutyType: dutyInfo.dutyType || "",
            dutyStartDate: dutyInfo.dutyStartDate,
            dutyEndDate: dutyInfo.dutyEndDate,
            dutyStartTime: dutyInfo.dutyStartTime,
            dutyEndTime: dutyInfo.dutyEndTime,
            dutyStartKm: dutyInfo.dutyStartKm,
            dutyEndKm: dutyInfo.dutyEndKm,
          }
        : null,
      expense: expenseDoc
        ? {
            billingItems: expenseDoc.billingItems || [],
            totalAllowances: expenseAllowances,
            allowanceDetails: {
              dailyAllowance: expenseDoc.dailyAllowance || 0,
              outstationAllowance: expenseDoc.outstationAllowance || 0,
              nightAllowance: expenseDoc.nightAllowance || 0,
            },
            totals: {
              billingSum: expenseBilling,
              total: expenseTotal,
            },
            notes: expenseDoc.notes || "",
          }
        : null,
      receiving: receivingDoc
        ? {
            billingItems: receivingDoc.billingItems || [],
            totalAllowances: receivingDoc.totalAllowances || 0,
            totalReceivingAmount: receivingAmount,
            allowanceDetails: {
              dailyAllowance: receivingDoc.dailyAllowance || 0,
              outstationAllowance: receivingDoc.outstationAllowance || 0,
              nightAllowance: receivingDoc.nightAllowance || 0,
            },
            receivingDetails: {
              receivedFromClient: receivingDoc.receivedFromClient || 0,
              clientAdvanceAmount: receivingDoc.clientAdvanceAmount || 0,
              clientBonusAmount: receivingDoc.clientBonusAmount || 0,
              incentiveAmount: receivingDoc.incentiveAmount || 0,
            },
            totals: {
              billingSum: receivingBilling,
              total: receivingTotal,
            },
            notes: receivingDoc.notes || "",
          }
        : null,
      stats: (() => {
        const base = { expenseTotal, receivingTotal, difference };
        if (booking.status === 1) {
          // Booking marked completed/settled; hide extra status fields
          base.settled = true;
        } else {
          base.status = difference > 0 ? "over" : difference < 0 ? "under" : "balanced";
          base.settlementHint = settlementHint; // direction only, not an action
        }
        return base;
      })(),
      message: {
        dutyInfo: dutyInfo ? "Duty information available" : "Duty information not found. Please create duty info first.",
        expense: expenseDoc ? "Expense information available" : "No expense record found.",
        receiving: receivingDoc ? "Receiving information available" : "No receiving record found."
      }
    });
  } catch (error) {
    console.error("Get user booking expense/receiving error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


const userController = {
  getalldriverbooks,
  getdriverprofile,
  getUserExpenseAndRecievings
};

export default userController;
