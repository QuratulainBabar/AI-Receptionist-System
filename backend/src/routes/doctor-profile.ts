import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { requireDoctorEnrollment } from "../middleware/enrollment.js";
import * as doctorProfileController from "../controllers/doctor-profile.controller.js";

export const doctorProfileRouter = Router();

doctorProfileRouter.use(authenticate, requireRole(Role.DOCTOR), requireDoctorEnrollment);

doctorProfileRouter.get("/", doctorProfileController.getProfile);
doctorProfileRouter.put("/", doctorProfileController.updateProfile);
