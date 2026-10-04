import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as activityController from "../controllers/activity.controller.js";

export const activityRouter = Router();

activityRouter.use(authenticate, requireRole(Role.PATIENT));

activityRouter.get("/", activityController.list);
