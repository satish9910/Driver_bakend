// controllers/driverController.js
import xlsx from "xlsx";
import fs from "fs";
import Booking from "../models/Booking.js";
import User from "../models/user.js";
import admin from "../models/adminModel.js";
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
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

    fs.unlinkSync(req.file.path);

    let valid = [];
    let invalid = [];

    for (const row of rows) {
      try {
        // Extract driver code from Excel row
        const excelDriverCode = row["Driver Code"] ? String(row["Driver Code"]).trim() : null;

        let driver = null;
        if (excelDriverCode) {
          driver = await User.findOne({ drivercode: excelDriverCode });
        }

        // Convert row to key-value array
        const dataArray = Object.keys(row).map((key) => {
          let value = row[key];
          if ([
            "Start Date",
            "End Date",
            "Actual Start Date",
            "Allotment Date",
            "Dispatched Date",
            "Cancelled On",
            "Duty Slip Entry Date",
            "Duty created at"
          ].includes(key)) {
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
    res.status(500).json({ message: "Error uploading bookings", error: error.message });
  }
};




const getAllBookings = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let filter = {};

    // Build dynamic filter based on Start Date / End Date inside `data`
    if (startDate && endDate) {
      filter.$and = [
        {
          data: {
            $elemMatch: {
              key: "Start Date",
              value: { $gte: startDate }, // Compare string
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

    const bookings = await Booking.find(filter)
      .populate({
      path: "driver",
      select: "-password"
      })
      .populate({
      path: "expenses",
      model: "Expenses"
      })
      .sort({ createdAt: -1 });

    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching bookings",
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

export {
  getAllDrivers,
  editDriver,
  deleteDriver,
  getDriverDetails,
  getAllSubAdmin,
  deleteSubAdmin,
  uploadBookings,
  getAllBookings,
  dashboard,
  assignDriver,
};
