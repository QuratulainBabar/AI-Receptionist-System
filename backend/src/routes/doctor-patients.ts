import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { requireDoctorReady } from "../middleware/enrollment.js";
import * as doctorPatientsController from "../controllers/doctor-patients.controller.js";

export const doctorPatientsRouter = Router();

doctorPatientsRouter.use(authenticate, requireRole(Role.DOCTOR), requireDoctorReady);

doctorPatientsRouter.get("/", doctorPatientsController.list);
doctorPatientsRouter.get("/:patientId/records/:recordId/file", doctorPatientsController.viewRecordFile);
doctorPatientsRouter.post("/:patientId/notes", doctorPatientsController.addNote);
doctorPatientsRouter.post("/:patientId/prescriptions", doctorPatientsController.addPrescription);
doctorPatientsRouter.get("/:patientId", doctorPatientsController.getOne);
