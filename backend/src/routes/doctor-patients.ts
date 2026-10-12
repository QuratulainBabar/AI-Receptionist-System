import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  attachClinicContext,
  requireClinicPermission,
} from "../middleware/clinic-context.js";
import { requireDoctorReady } from "../middleware/enrollment.js";
import * as doctorPatientsController from "../controllers/doctor-patients.controller.js";

export const doctorPatientsRouter = Router();

doctorPatientsRouter.use(
  authenticate,
  requireRole(Role.DOCTOR, Role.CLINIC_STAFF),
  attachClinicContext,
  requireDoctorReady,
  requireClinicPermission("patients"),
);

doctorPatientsRouter.get("/", doctorPatientsController.list);
doctorPatientsRouter.post("/", doctorPatientsController.create);
doctorPatientsRouter.get("/:patientId/records/:recordId/file", doctorPatientsController.viewRecordFile);
doctorPatientsRouter.post("/:patientId/notes", doctorPatientsController.addNote);
doctorPatientsRouter.post("/:patientId/prescriptions", doctorPatientsController.addPrescription);
doctorPatientsRouter.patch("/:patientId", doctorPatientsController.update);
doctorPatientsRouter.delete("/:patientId", doctorPatientsController.remove);
doctorPatientsRouter.get("/:patientId", doctorPatientsController.getOne);
