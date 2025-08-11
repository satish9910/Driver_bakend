// routes/auth.js
import express from "express";
import publicController from "../controllers/public.js";

const router = express.Router();

router.post("/user-signup", publicController.userSignup);
router.post("/user-login", publicController.userLogin);

export default router;
