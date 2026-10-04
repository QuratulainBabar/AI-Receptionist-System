import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as doctorActivityController from "../controllers/doctor-activity.controller.js";

export const doctorActivityRouter = Router();

doctorActivityRouter.use(authenticate, requireRole(Role.DOCTOR));

doctorActivityRouter.get("/", doctorActivityController.list);
