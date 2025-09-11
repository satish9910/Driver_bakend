import User from "../models/user.js";
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



const userController = {
  getalldriverbooks,
  getdriverprofile
};

export default userController;
