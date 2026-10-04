import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as doctorDashboardController from "../controllers/doctor-dashboard.controller.js";

export const doctorDashboardRouter = Router();

doctorDashboardRouter.use(authenticate, requireRole(Role.DOCTOR));

doctorDashboardRouter.get("/", doctorDashboardController.get);
