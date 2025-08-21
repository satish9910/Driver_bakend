import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Admin from "../models/adminModel.js";


const userSignup = async (req, res) => {
  const { name, drivercode, email, mobile, password } = req.body;
  const profilePicture = req.file ? req.file.path : null; // if you're uploading file with multer

  try {
    // Check if user with same email or mobile already exists
    const existingUser = await User.findOne({ $or: [{ email }, { mobile }] });

    if (existingUser) {
      return res.status(400).json({ error: "Email or mobile already in use" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      name,
      drivercode,
      email,
      mobile,
      password: hashedPassword,
      profilePicture,
    });

    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        drivercode: user.drivercode,
        email: user.email,
        mobile: user.mobile,
        profilePicture: user.profilePicture,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Server error" });
  }
};



const userLogin = async (req, res) => {
  const { emailOrMobile, password } = req.body;

  try {
    // Find user by email or mobile
    const user = await User.findOne({
      $or: [{ email: emailOrMobile }, { mobile: emailOrMobile }],
    });

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Account is deactivated" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user._id , role: user.role},
      process.env.JWT_SECRET,

      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        drivercode: user.drivercode,
        role: user.role,
        vehicleNumber: user.vehicleNumber,
        licenseNumber: user.licenseNumber,
        isActive: user.isActive,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error" });
  }
};




// Admin/Subadmin Registration
const registerAdminOrSubadmin = async (req, res) => {
  const { name, email, password, role, permissions } = req.body;

  try {
    // Validate role
    if (!["admin", "subadmin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    // Check if admin exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ error: "Email already in use" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new admin
    const newAdmin = new Admin({
      name,
      email,
      password: hashedPassword,
      role,
      permissions: role === "subadmin" ? permissions || [] : []
    });

    await newAdmin.save();

    // JWT token
    const token = jwt.sign(
      { adminId: newAdmin._id, role: newAdmin.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      message: `${role} registered successfully`,
      token,
      admin: {
        id: newAdmin._id,
        name: newAdmin.name,
        email: newAdmin.email,
        role: newAdmin.role,
        permissions: newAdmin.permissions
      }
    });
  } catch (error) {
    console.error("Error registering admin/subadmin:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Admin/Subadmin Login
const loginAdminOrSubadmin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Find admin
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    // JWT token
    const token = jwt.sign(
      { adminId: admin._id, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions
      }
    });
  } catch (error) {
    console.error("Error logging in admin/subadmin:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};





const publicController = {
  userSignup,
  userLogin,
  registerAdminOrSubadmin,
  loginAdminOrSubadmin
};

export default publicController;