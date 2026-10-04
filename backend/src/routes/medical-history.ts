import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as medicalHistoryController from "../controllers/medical-history.controller.js";

export const medicalHistoryRouter = Router();

medicalHistoryRouter.use(authenticate, requireRole(Role.PATIENT));

medicalHistoryRouter.get("/", medicalHistoryController.getHistory);
medicalHistoryRouter.put("/", medicalHistoryController.saveHistory);
