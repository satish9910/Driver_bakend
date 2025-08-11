
import User from "../models/user.js";
import Expenses from "../models/expenses.js";


const getUserDetails = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select("-password"); // exclude password

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ user });
  } catch (err) {
    console.error("Error fetching user details:", err);
    res.status(500).json({ error: "Server error" });
  }
};




const userController = {
  getUserDetails
};

export default userController;