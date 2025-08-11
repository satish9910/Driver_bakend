import express from "express";
const app = express();
import cors from "cors";
import connectDB from "./db/database.js";
import dotenv from "dotenv";
const port = process.env.PORT || 3000;

dotenv.config();

import publicRoutes from "./routes/public.routes.js";
import expenseRoutes from "./routes/expense.routes.js";
import userRoutes from "./routes/user.routes.js";



// Middleware to handle CORS
app.use(cors());

// Middleware to log requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/public", publicRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/user", userRoutes);

await connectDB(); // Connect to the database

app.get("/", (req, res) => {
  res.send("Hello World!");
});
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
