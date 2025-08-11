// middleware/auth.js
import jwt from "jsonwebtoken";

export const authentication = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authorized, token missing" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // contains { userId: ... }
    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(401).json({ error: "Token invalid or expired" });
  }
};
