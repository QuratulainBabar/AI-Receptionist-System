import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as dashboardController from "../controllers/dashboard.controller.js";

export const dashboardRouter = Router();

dashboardRouter.use(authenticate, requireRole(Role.PATIENT));

dashboardRouter.get("/", dashboardController.get);
