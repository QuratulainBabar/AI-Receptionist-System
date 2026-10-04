import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as doctorPatientsController from "../controllers/doctor-patients.controller.js";

export const doctorPatientsRouter = Router();

doctorPatientsRouter.use(authenticate, requireRole(Role.DOCTOR));

doctorPatientsRouter.get("/", doctorPatientsController.list);
doctorPatientsRouter.get("/:patientId/records/:recordId/file", doctorPatientsController.viewRecordFile);
doctorPatientsRouter.get("/:patientId", doctorPatientsController.getOne);
