// import User from "../models/user.js";
import Booking from "../models/Booking.js";

const getalldriverbooks = (req, res) => {
  console.log("Fetching all driver bookings for user:", req.user.userId);
  Booking.find({ driver: req.user.userId })
    .populate("driver", "name email mobile drivercode vehicleNumber")
    .sort({ createdAt: -1 })
    .then((bookings) => {
      res.status(200).json({
        success: true,
        count: bookings.length,
        bookings,
      });
    })
    .catch((error) => {
      console.error("Error fetching driver bookings:", error);
      res.status(500).json({ success: false, message: "Server error" });
    });
};

const userController = {
  getalldriverbooks,
};

export default userController;
