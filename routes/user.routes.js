// routes/auth.js
import express from "express";
import userController from "../controllers/user.js";
import { authentication } from "../middlewares/auth.js";

const router = express.Router();

router.get("/get-user-details", authentication, userController.getUserDetails);

export default router;
