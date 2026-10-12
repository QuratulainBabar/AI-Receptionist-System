import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { attachClinicContext } from "../middleware/clinic-context.js";
import { requireDoctorEnrollment } from "../middleware/enrollment.js";
import * as doctorDashboardController from "../controllers/doctor-dashboard.controller.js";

export const doctorDashboardRouter = Router();

doctorDashboardRouter.use(authenticate, requireRole(Role.DOCTOR, Role.CLINIC_STAFF), attachClinicContext, requireDoctorEnrollment);

doctorDashboardRouter.get("/", doctorDashboardController.get);
