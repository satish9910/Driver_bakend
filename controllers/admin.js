// controllers/driverController.js
import xlsx from "xlsx";
import fs from "fs";
import Booking from "../models/Booking.js";
import User from "../models/user.js";
import admin from "../models/adminModel.js";
import Expenses from "../models/expenses.js";
import Receiving from "../models/receiving.js";
// import { parseValue } from "../utils/parseValue.js";

// admin states

const dashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalBookings = await Booking.countDocuments();
    const totalSubAdmins = await admin.countDocuments({ role: "subadmin" });
    const totalTransactions = await Booking.aggregate([
      { $group: { _id: null, total: { $sum: "$price" } } },
    ]);
    res.status(200).json({
      totalUsers,
      totalBookings,
      totalSubAdmins,
      totalTransactions: totalTransactions[0]?.total || 0,
    });
  } catch (error) {
    console.error("Dashboard data fetching error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// GET ALL DRIVERS
//
const getAllDrivers = async (req, res) => {
  try {
    const drivers = await User.find().select("-password"); // All users are drivers in this model
    res.status(200).json({
      message: "Drivers fetched successfully",
      drivers,
    });
  } catch (error) {
    console.error("Get all drivers error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// EDIT DRIVER
const editDriver = async (req, res) => {
  const { id } = req.params;
  const { name, email, mobile, isActive, drivercode } = req.body;

  try {
    // If new profile picture is uploaded
    const profilePicture = req.file ? req.file.path : undefined;

    // Build update object
    const updateData = { name, email, mobile, isActive, drivercode };

    if (profilePicture) {
      updateData.profilePicture = profilePicture;
    }

    const updatedDriver = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updatedDriver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    res.status(200).json({
      message: "Driver updated successfully",
      driver: {
        id: updatedDriver._id,
        name: updatedDriver.name,
        drivercode: updatedDriver.drivercode,
        email: updatedDriver.email,
        mobile: updatedDriver.mobile,
        profilePicture: updatedDriver.profilePicture,
        isActive: updatedDriver.isActive,
      },
    });
  } catch (error) {
    console.error("Edit driver error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// DELETE DRIVER
const deleteDriver = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedDriver = await User.findByIdAndDelete(id);

    if (!deletedDriver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    res.status(200).json({ message: "Driver deleted successfully" });
  } catch (error) {
    console.error("Delete driver error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

//get driver details
const getDriverDetails = async (req, res) => {
  const { id } = req.params;

  try {
    const driver = await User.findById(id)
      .select("-password")
      .populate("bookings");

    if (!driver) {
      return res.status(404).json({ error: "Driver not found" });
    }

    res.status(200).json({
      message: "Driver fetched successfully",
      driver,
    });
  } catch (error) {
    console.error("Get driver details error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

//get all subAdmin

const getAllSubAdmin = async (req, res) => {
  try {
    const subAdmins = await admin
      .find({ role: "subadmin" })
      .select("-password");
    res.status(200).json({
      message: "Sub-admins fetched successfully",
      subAdmins,
    });
  } catch (error) {
    console.error("Get all sub-admins error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

//edit sub-admin
// edit sub-admin
// const editSubAdmin = async (req, res) => {
//     const { id } = req.params;
//     const { name, email, mobile, permissions } = req.body;

//     try {
//         const updatedSubAdmin = await admin.findByIdAndUpdate(
//             id,
//             { name, email, mobile, permissions },
//             { new: true, runValidators: true }
//         ).select("-password");

//         if (!updatedSubAdmin) {
//             return res.status(404).json({ error: "Sub-admin not found" });
//         }

//         res.status(200).json({
//             message: "Sub-admin updated successfully",
//             subAdmin: updatedSubAdmin,
//         });
//     } catch (error) {
//         console.error("Edit sub-admin error:", error);
//         res.status(500).json({ error: "Server error" });
//     }
// };

// delete sub-admin
const deleteSubAdmin = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedSubAdmin = await admin.findOneAndDelete({
      _id: id,
      role: "subadmin",
    });

    if (!deletedSubAdmin) {
      return res.status(404).json({ error: "Sub-admin not found" });
    }

    res.status(200).json({ message: "Sub-admin deleted successfully" });
  } catch (error) {
    console.error("Delete sub-admin error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

//booking controlers

function formatExcelDate(value) {
  if (!value) return "";

  if (typeof value === "number") {
    const date = xlsx.SSF.parse_date_code(value);
    if (!date) return "";
    const jsDate = new Date(Date.UTC(date.y, date.m - 1, date.d));
    return jsDate.toLocaleDateString("en-GB").replace(/\//g, "-");
  }

  if (value instanceof Date) {
    return value.toLocaleDateString("en-GB").replace(/\//g, "-");
  }

  if (typeof value === "string") {
    const parts = value.split(/[-/]/);
    if (parts.length === 3) {
      let [day, month, year] = parts;
      if (year.length === 2) year = "20" + year;
      if (parseInt(day) > 1900) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return `${day.padStart(2, "0")}-${month.padStart(2, "0")}-${year}`;
    }
  }

  return String(value);
}

const uploadBookings = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const fileExt = req.file.originalname.split(".").pop().toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(fileExt)) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Invalid file format" });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
      defval: "",
    });

    fs.unlinkSync(req.file.path);

    let valid = [];
    let invalid = [];

    for (const row of rows) {
      try {
        // Extract driver code from Excel row
        const excelDriverCode = row["Driver Code"]
          ? String(row["Driver Code"]).trim()
          : null;

        let driver = null;
        if (excelDriverCode) {
          driver = await User.findOne({ drivercode: excelDriverCode });
        }

        // Convert row to key-value array
        const dataArray = Object.keys(row).map((key) => {
          let value = row[key];
          if (
            [
              "Start Date",
              "End Date",
              "Actual Start Date",
              "Allotment Date",
              "Dispatched Date",
              "Cancelled On",
              "Duty Slip Entry Date",
              "Duty created at",
            ].includes(key)
          ) {
            value = formatExcelDate(value);
          }
          return { key, value };
        });

        const booking = new Booking({
          driver: driver ? driver._id : null,
          data: dataArray,
        });

        await booking.save();

        // If driver exists, push booking reference to driver
        if (driver) {
          driver.bookings.push(booking._id);
          await driver.save();
        }

        valid.push(booking);
      } catch (err) {
        invalid.push({ row, error: err.message });
      }
    }

    res.json({
      message: "File processed successfully",
      inserted: valid.length,
      errors: invalid.length,
      invalidRows: invalid,
    });
  } catch (error) {
    console.error("Upload bookings error:", error);
    res
      .status(500)
      .json({ message: "Error uploading bookings", error: error.message });
  }
};

// GET /api/bookings/keys
const getAllBookingKeys = async (req, res) => {
  try {
    const keys = await Booking.distinct("data.key");
    res.status(200).json({ keys });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching keys", error: error.message });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const { startDate, endDate, keys } = req.query;
    let filter = {};

    // ---- Date filter logic (same as yours) ----
    if (startDate && endDate) {
      filter.$and = [
        {
          data: {
            $elemMatch: {
              key: "Start Date",
              value: { $gte: startDate }, // string compare
            },
          },
        },
        {
          data: {
            $elemMatch: {
              key: "End Date",
              value: { $lte: endDate },
            },
          },
        },
      ];
    } else if (startDate) {
      filter.data = {
        $elemMatch: {
          key: "Start Date",
          value: { $gte: startDate },
        },
      };
    } else if (endDate) {
      filter.data = {
        $elemMatch: {
          key: "End Date",
          value: { $lte: endDate },
        },
      };
    }

    // ---- Fetch bookings ----
    const bookings = await Booking.find(filter)
      .populate({ path: "driver", select: "-password" })
      .populate({ path: "expenses", model: "Expenses" })
      .populate({ path: "primaryExpense", model: "Expenses" })
      .populate({ path: "receiving", model: "Receiving" })
      .populate({ path: "labels", select: "name color" })
      .sort({ createdAt: -1 });

    // ---- Handle selected keys ----
    let selectedKeys = [];
    if (keys) {
      selectedKeys = keys.split(",").map((k) => k.trim());
    }

    const filteredBookings = bookings.map((booking) => {
      const dataMap = {};
      booking.data.forEach((d) => {
        if (selectedKeys.length === 0 || selectedKeys.includes(d.key)) {
          dataMap[d.key] = d.value;
        }
      });

      return {
        _id: booking._id,
        driver: booking.driver,
        expenses: booking.expenses,
        primaryExpense: booking.primaryExpense || null,
        receiving: booking.receiving || null,
        status: booking.status,
        labels: booking.labels || [],
        data: dataMap, // only selected keys
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      };
    });

    res.status(200).json(filteredBookings);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching bookings",
      error: error.message,
    });
  }
};

// POST /api/bookings/filter
const filterBookings = async (req, res) => {
  try {
    const { startDate, endDate, keys } = req.body;
    let filter = {};

    // ---- Date filter (optional) ----
    if (startDate || endDate) {
      const dateConditions = [];

      if (startDate) {
        dateConditions.push({
          data: {
            $elemMatch: { key: "Start Date", value: { $gte: startDate } },
          },
        });
      }

      if (endDate) {
        dateConditions.push({
          data: {
            $elemMatch: { key: "End Date", value: { $lte: endDate } },
          },
        });
      }

      // Use $and only if multiple conditions
      filter.$and = dateConditions;
    }

    // ---- Fetch bookings ----
    const bookings = await Booking.find(filter)
      .populate({ path: "driver", select: "name drivercode" })
      .populate({ path: "expenses", model: "Expenses" })
      .populate({ path: "primaryExpense", model: "Expenses" })
      .populate({ path: "receiving", model: "Receiving" })
      .populate({ path: "labels", select: "name color" })
      .sort({ createdAt: -1 });

    // ---- Filter keys from request ----
    const filteredBookings = bookings.map((booking) => {
      const dataMap = {};

      booking.data.forEach((d) => {
        if (!keys || keys.length === 0 || keys.includes(d.key)) {
          dataMap[d.key] = d.value;
        }
      });

      return {
        _id: booking._id,
        driver: booking.driver,
        expenses: booking.expenses,
        primaryExpense: booking.primaryExpense || null,
        receiving: booking.receiving || null,
        status: booking.status,
        labels: booking.labels || [],
        data: dataMap, // only requested keys
        createdAt: booking.createdAt,
        updatedAt: booking.updatedAt,
      };
    });

    res
      .status(200)
      .json({
        success: true,
        count: filteredBookings.length,
        data: filteredBookings,
      });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error filtering bookings",
      error: error.message,
    });
  }
};

const assignDriver = async (req, res) => {
  try {
    const { bookingId, driverId } = req.body;
    // 1️⃣ Check if booking exists
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // 2️⃣ Check if driver exists
    const driver = await User.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    // 3️⃣ Assign driver to booking
    booking.driver = driverId;
    await booking.save();

    // 4️⃣ Add booking to driver's booking list (avoid duplicates)
    if (!driver.bookings.includes(bookingId)) {
      driver.bookings.push(bookingId);
      await driver.save();
    }

    res.status(200).json({ message: "Driver assigned successfully", booking });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error assigning driver", error: error.message });
  }
};

// Get detailed booking including expenses and settlement info
const getBookingDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const booking = await Booking.findById(id)
      .populate({
        path: "driver",
        select: "name email mobile drivercode wallet",
      })
      .populate({ path: "primaryExpense", model: "Expenses" })
      .populate({ path: "receiving", model: "Receiving" })
      .populate({ path: "labels", model: "Label" });

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // New totals (use primaryExpense if present else first expense) paired with receiving
    const primary = booking.primaryExpense;
    let expenseTotals = null;
    let receivingTotals = null;
    let difference = null;
    if (primary) {
      const billingSum = (primary.billingItems || []).reduce(
        (s, i) => s + (Number(i.amount) || 0),
        0
      );
      const totalAllowances = primary.totalAllowances || 0;
      const totalExpense = billingSum + totalAllowances;
      expenseTotals = { billingSum, totalAllowances, totalExpense };
      if (booking.receiving) {
        const r = booking.receiving;
        const receivingBillingSum = (r.billingItems || []).reduce(
          (s, i) => s + (Number(i.amount) || 0),
          0
        );
        const receivingAllowances = r.totalAllowances || 0;
        const receivedFromCompany = r.receivedFromCompany || 0;
        const receivedFromClient = r.receivedFromClient || 0;
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
    }

    res.json({
      booking,
      totals: {
        expense: expenseTotals,
        receiving: receivingTotals,
        difference,
      },
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error fetching booking detail", error: err.message });
  }
};

// Update booking status (0 -> 1 complete)
const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // expect 0 or 1
    if (![0, 1].includes(status))
      return res.status(400).json({ message: "Invalid status" });

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.status = status;
    if (status === 1) booking.completedAt = new Date();
    await booking.save();

    res.json({ message: "Status updated", booking });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error updating status", error: err.message });
  }
};

// Settle driver expenses for a booking
const settleBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      settlementAmount,
      adminAdjustments = 0,
      notes = "",
      markComplete,
    } = req.body;

    const booking = await Booking.findById(id).populate({
      path: "expenses",
      model: "Expenses",
    });
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    let totalDriverExpense = 0;
    let totalAdvance = 0;
    if (booking.expenses && booking.expenses.length) {
      booking.expenses.forEach((exp) => {
        totalDriverExpense += exp.totalDriverExpense || 0;
        totalAdvance +=
          (exp.advanceAmount || 0) + (exp.advanceFromCompany || 0);
      });
    }
    const defaultSettlement =
      totalDriverExpense - totalAdvance + Number(adminAdjustments || 0);
    const finalSettlement =
      settlementAmount != null ? Number(settlementAmount) : defaultSettlement;

    booking.settlement.isSettled = true;
    booking.settlement.settlementAmount = finalSettlement;
    booking.settlement.adminAdjustments = Number(adminAdjustments || 0);
    booking.settlement.notes = notes;
    booking.settlement.settledAt = new Date();

    if (markComplete) {
      booking.status = 1;
      booking.completedAt = new Date();
    }

    await booking.save();

    res.json({
      message: "Booking settled",
      booking,
      computed: {
        totalDriverExpense,
        totalAdvance,
        defaultSettlement,
        finalSettlement,
      },
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Error settling booking", error: err.message });
  }
};

// Admin/Subadmin create or edit an EXPENSE they own (claim if unowned)
const upsertAdminExpense = async (req, res) => {
  try {
    const role = req.user?.role;
    if (!["admin", "subadmin"].includes(role))
      return res.status(403).json({ message: "Forbidden" });

    const bookingId = req.params.bookingId || req.body.bookingId;
    if (!bookingId)
      return res.status(400).json({ message: "bookingId required" });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (!booking.driver)
      return res
        .status(400)
        .json({ message: "Booking has no driver assigned" });
    const userId = booking.driver; // driver user id

    let expense = await Expenses.findOne({ bookingId, userId });
    const creating = !expense;
    if (!expense) expense = new Expenses({ bookingId, userId });

    // Ownership checks (only original creating admin/subadmin can edit)
    if (
      expense.createdByAdmin &&
      expense.createdByAdmin.toString() !== req.user.userId
    ) {
      return res
        .status(403)
        .json({
          message: "Only creating admin/subadmin can edit this expense",
        });
    }
    if (!expense.createdByAdmin) {
      expense.createdByAdmin = req.user.userId;
      expense.createdByRole = role;
    }

    const b = req.body || {};
    const parseNum = (v) =>
      v === "" || v == null ? undefined : Number(v) || 0;
    const setIf = (field, transform = (v) => v) => {
      if (b[field] != null) expense[field] = transform(b[field]);
    };

    // Duty fields
    ["dutyStartDate", "dutyEndDate"].forEach((f) =>
      setIf(f, (v) => new Date(v))
    );
    ["dutyStartTime", "dutyEndTime", "dutyType", "notes"].forEach((f) =>
      setIf(f)
    );
    ["dutyStartKm", "dutyEndKm"].forEach((f) =>
      setIf(f, (v) => Number(v) || 0)
    );

    // Allowances
    const allowanceFields = [
      "dailyAllowance",
      "outstationAllowance",
      "earlyStartAllowance",
      "nightAllowance",
      "overTime",
      "sundayAllowance",
      "outstationOvernightAllowance",
      "extraDutyAllowance",
    ];
    allowanceFields.forEach((f) => {
      const n = parseNum(b[f]);
      if (n !== undefined) expense[f] = n;
    });

    // billingItems (accept JSON string / array)
    if (b.billingItems != null) {
      let items = b.billingItems;
      if (typeof items === "string") {
        try {
          items = JSON.parse(items);
        } catch {
          return res.status(400).json({ message: "billingItems invalid JSON" });
        }
      }
      if (!Array.isArray(items))
        return res.status(400).json({ message: "billingItems must be array" });

      // If files uploaded (form-data style) attach images: fields like billingItems[0].image
      if (req.files) {
        for (const field in req.files) {
          const filesArr = req.files[field];
          filesArr.forEach((f) => {
            const m = field.match(/^billingItems\[(\d+)\]\.image$/);
            if (m) {
              const idx = parseInt(m[1]);
              if (items[idx]) items[idx].image = f.path;
            }
          });
        }
      }

      expense.billingItems = items
        .filter((i) => i && i.category && i.amount != null)
        .map((i) => ({
          category: i.category,
          amount: Number(i.amount) || 0,
          image: i.image || null,
          note: i.note || "",
        }));
    }

    // Recompute totals
    const billingSum = (expense.billingItems || []).reduce(
      (s, i) => s + (Number(i.amount) || 0),
      0
    );
    const totalAllowances = allowanceFields.reduce(
      (s, f) => s + (Number(expense[f]) || 0),
      0
    );
    expense.totalAllowances = totalAllowances;
    expense.totalDriverExpense = billingSum + totalAllowances;

    expense.lastEditedByAdmin = req.user.userId;
    expense.lastEditedAt = new Date();
    await expense.save();

    // Link into booking
    booking.expenses = booking.expenses || [];
    if (
      !booking.expenses
        .map((e) => e.toString())
        .includes(expense._id.toString())
    ) {
      booking.expenses.push(expense._id);
    }
    booking.primaryExpense = expense._id;
    await booking.save();

    // Automatic reconciliation against receiving (if exists)
    let reconciliation = null;
    try {
      const receiving = await Receiving.findOne({ bookingId, userId });
      if (receiving) {
        const expenseBillingSum = billingSum;
        const receivingBillingSum = (receiving.billingItems || []).reduce(
          (s, i) => s + (Number(i.amount) || 0),
          0
        );

        const totalExpense = expenseBillingSum + (expense.totalAllowances || 0);
        const totalReceiving =
          receivingBillingSum +
          (receiving.totalAllowances || 0) +
          (receiving.receivedFromCompany || 0) +
          (receiving.receivedFromClient || 0);

        const difference = Number((totalExpense - totalReceiving).toFixed(2));

        if (difference === 0) {
          reconciliation = { action: "none", difference: 0 };
        } else {
          // Lazy load Transaction model (to avoid needing top-level import change)
          let Transaction = null;
          try {
            ({ default: Transaction } = await import(
              "../models/Transaction.js"
            ));
          } catch {
            /* ignore */
          }

          const user = await User.findById(userId);
          if (user) {
            if (!user.wallet) user.wallet = { balance: 0 };
            let txn = null;
            if (difference > 0) {
              // credit to driver
              user.wallet.balance += difference;
              await user.save();
              if (Transaction) {
                txn = await Transaction.create({
                  userId: user._id,
                  amount: difference,
                  type: "credit",
                  description: `Auto reconciliation (admin) for booking ${bookingId}`,
                  balanceAfter: user.wallet.balance,
                  category: "user_wallet",
                  meta: { performedBy: req.user.userId, role },
                });
              }
              reconciliation = {
                action: "credit",
                difference,
                transactionId: txn?._id || null,
              };
            } else {
              const debitAmt = Math.abs(difference);
              if (user.wallet.balance >= debitAmt) {
                user.wallet.balance -= debitAmt;
                await user.save();
                if (Transaction) {
                  txn = await Transaction.create({
                    userId: user._id,
                    amount: debitAmt,
                    type: "debit",
                    description: `Auto reconciliation (admin) for booking ${bookingId}`,
                    balanceAfter: user.wallet.balance,
                    category: "user_wallet",
                    meta: { performedBy: req.user.userId, role },
                  });
                }
                reconciliation = {
                  action: "debit",
                  difference,
                  transactionId: txn?._id || null,
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
        }
      }
    } catch (reconErr) {
      console.error("Reconciliation error:", reconErr);
      reconciliation = { action: "error", reason: reconErr.message };
    }

    const totalDistance =
      expense.dutyStartKm != null && expense.dutyEndKm != null
        ? expense.dutyEndKm - expense.dutyStartKm
        : null;

    res.json({
      message: creating ? "Expense created" : "Expense updated",
      owned: true,
      expense,
      totals: {
        billingSum,
        totalAllowances,
        totalDriverExpense: expense.totalDriverExpense,
        totalDistance,
      },
      reconciliation,
    });
  } catch (err) {
    console.error("upsertAdminExpense error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// Admin/Subadmin create or edit a RECEIVING they own (claim if unowned)
const upsertAdminReceiving = async (req, res) => {
  try {
    const role = req.user?.role;
    if (!["admin", "subadmin"].includes(role))
      return res.status(403).json({ message: "Forbidden" });
    const bookingId = req.params.bookingId || req.body.bookingId;
    if (!bookingId)
      return res.status(400).json({ message: "bookingId required" });
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (!booking.driver)
      return res
        .status(400)
        .json({ message: "Booking has no driver assigned" });
    const userId = booking.driver;

    let receiving = await Receiving.findOne({ bookingId, userId });
    const creating = !receiving;
    if (!receiving) receiving = new Receiving({ bookingId, userId });

    if (
      receiving.createdByAdmin &&
      receiving.createdByAdmin.toString() !== req.user.userId
    ) {
      return res
        .status(403)
        .json({
          message: "Only creating admin/subadmin can edit this receiving",
        });
    }
    if (!receiving.createdByAdmin) {
      receiving.createdByAdmin = req.user.userId;
      receiving.createdByRole = role;
    }

    const b = req.body || {};
    const parseNum = (v) =>
      v === "" || v == null ? undefined : Number(v) || 0;
    const setIf = (f, transform = (v) => v) => {
      if (b[f] != null) receiving[f] = transform(b[f]);
    };
    ["dutyStartDate", "dutyEndDate"].forEach((f) =>
      setIf(f, (v) => new Date(v))
    );
    ["dutyStartTime", "dutyEndTime", "dutyType", "notes"].forEach((f) =>
      setIf(f)
    );
    ["dutyStartKm", "dutyEndKm"].forEach((f) =>
      setIf(f, (v) => Number(v) || 0)
    );
    // Allowances + received
    [
      "dailyAllowance",
      "outstationAllowance",
      "earlyStartAllowance",
      "nightAllowance",
      "receivedFromCompany",
      "receivedFromClient",
      "overTime",
      "sundayAllowance",
      "outstationOvernightAllowance",
      "extraDutyAllowance",
    ].forEach((f) => {
      const n = parseNum(b[f]);
      if (n !== undefined) receiving[f] = n;
    });

    if (b.billingItems != null) {
      let items = b.billingItems;
      if (typeof items === "string") {
        try {
          items = JSON.parse(items);
        } catch {
          return res.status(400).json({ message: "billingItems invalid JSON" });
        }
      }
      if (!Array.isArray(items))
        return res.status(400).json({ message: "billingItems must be array" });
      receiving.billingItems = items
        .filter((i) => i && i.category && i.amount != null)
        .map((i) => ({
          category: i.category,
          amount: Number(i.amount) || 0,
          image: i.image || null,
          note: i.note || "",
        }));
    }

    // Recompute totalAllowances (exclude receivedFromCompany/Client)
    receiving.totalAllowances = [
      receiving.dailyAllowance,
      receiving.outstationAllowance,
      receiving.earlyStartAllowance,
      receiving.nightAllowance,
      receiving.overTime,
      receiving.sundayAllowance,
      receiving.outstationOvernightAllowance,
      receiving.extraDutyAllowance,
    ].reduce((s, v) => s + (Number(v) || 0), 0);

    receiving.lastEditedByAdmin = req.user.userId;
    receiving.lastEditedAt = new Date();
    await receiving.save();

    if (!booking.receiving) {
      booking.receiving = receiving._id;
      await booking.save();
    }

    res.json({
      message: creating ? "Receiving created" : "Receiving updated",
      owned: true,
      receiving,
    });
  } catch (err) {
    console.error("upsertAdminReceiving error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

//getdriverbookingbyid

const getDriverBookingById = async (req, res) => {
  try {
    const { driverId } = req.params;
    if (!driverId) {
      return res.status(400).json({ message: "Driver ID is required" });
    }

    const driver = await User.findById(driverId)
      .select("name drivercode bookings")
      .populate({
        path: "bookings",
        options: { sort: { createdAt: -1 } },
        populate: [
          { path: "primaryExpense", model: "Expenses" },
          // include all individual expenses if needed
          { path: "expenses", model: "Expenses" },
          { path: "receiving", model: "Receiving" },
          { path: "labels", select: "name color" },
          { path: "driver", select: "name drivercode" },
        ],
      });

    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }

    const bookings = driver.bookings.map((b) => ({
      _id: b._id,
      status: b.status,
      data: b.data,
      primaryExpense: b.primaryExpense || null,
      receiving: b.receiving || null,
      // expenses: b.expenses || [],
      labels: b.labels || [],
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    }));

    res.status(200).json({
      success: true,
      driver: {
        _id: driver._id,
        name: driver.name,
        drivercode: driver.drivercode,
      },
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching driver bookings",
      error: error.message,
    });
  }
};

export {
  getAllDrivers,
  getAllBookingKeys,
  editDriver,
  deleteDriver,
  getDriverDetails,
  getAllSubAdmin,
  deleteSubAdmin,
  uploadBookings,
  getAllBookings,
  dashboard,
  assignDriver,
  getBookingDetail,
  updateBookingStatus,
  settleBooking,
  filterBookings,
  getDriverBookingById,
  upsertAdminExpense,
  upsertAdminReceiving,
};
