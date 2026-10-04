import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as notificationsController from "../controllers/notifications.controller.js";

export const doctorNotificationsRouter = Router();

doctorNotificationsRouter.use(authenticate, requireRole(Role.DOCTOR));

doctorNotificationsRouter.get("/", notificationsController.listForDoctor);
