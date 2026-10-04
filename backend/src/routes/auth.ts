import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { Role } from "@prisma/client";

export const authRouter = Router();

authRouter.post("/signup", authController.signup);
authRouter.post("/login", authController.login);
authRouter.post("/admin/login", authController.adminLogin);
authRouter.post("/forgot-password", authController.forgotPassword);
authRouter.post("/reset-password", authController.resetPassword);
authRouter.get("/me", authenticate, authController.me);

authRouter.get("/patient-only", authenticate, requireRole(Role.PATIENT), (_req, res) => {
  res.json({ success: true, message: "Patient access granted" });
});
authRouter.get("/doctor-only", authenticate, requireRole(Role.DOCTOR), (_req, res) => {
  res.json({ success: true, message: "Doctor access granted" });
});
authRouter.get("/admin-only", authenticate, requireRole(Role.SUPER_ADMIN), (_req, res) => {
  res.json({ success: true, message: "Super admin access granted" });
});
