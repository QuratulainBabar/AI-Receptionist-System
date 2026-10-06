import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { requireDoctorReady } from "../middleware/enrollment.js";
import * as doctorActivityController from "../controllers/doctor-activity.controller.js";

export const doctorActivityRouter = Router();

doctorActivityRouter.use(authenticate, requireRole(Role.DOCTOR), requireDoctorReady);

doctorActivityRouter.get("/", doctorActivityController.list);
