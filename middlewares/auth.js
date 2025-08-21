import jwt from "jsonwebtoken";

export const authentication = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authorized, token missing" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 

    // console.log("Authenticated user:", req.user);

    // Check for admin or subadmin role
    if (decoded.role !== "admin" && decoded.role !== "subadmin" && decoded.role !== "user") {
      return res.status(403).json({ error: "Forbidden: Insufficient role" });
    }

  // Normalize identifiers so downstream code can rely on userId
  req.user.userId = decoded.userId || decoded.adminId; 

    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(401).json({ error: "Token invalid or expired" });
  }
};
