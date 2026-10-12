import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { attachClinicContext } from "../middleware/clinic-context.js";
import { requireDoctorReady } from "../middleware/enrollment.js";
import * as notificationsController from "../controllers/notifications.controller.js";

export const doctorNotificationsRouter = Router();

doctorNotificationsRouter.use(authenticate, requireRole(Role.DOCTOR, Role.CLINIC_STAFF), attachClinicContext, requireDoctorReady);

doctorNotificationsRouter.get("/", notificationsController.listForDoctor);
