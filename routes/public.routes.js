// routes/auth.js
import express from "express";
import publicController from "../controllers/public.js";
import upload from "../middlewares/multer.js";


const router = express.Router();

router.post("/user-signup", upload.single("profilePicture"), publicController.userSignup);
router.post("/user-login", publicController.userLogin);
router.post("/admin-register", publicController.registerAdminOrSubadmin);
router.post("/admin-login", publicController.loginAdminOrSubadmin);

export default router;

