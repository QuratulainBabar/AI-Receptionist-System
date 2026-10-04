import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as doctorsController from "../controllers/doctors.controller.js";

export const doctorsRouter = Router();

// Patients browse, doctors/admin edit profiles.
doctorsRouter.get(
  "/specialties",
  authenticate,
  requireRole(Role.PATIENT, Role.DOCTOR, Role.SUPER_ADMIN),
  doctorsController.listSpecialties,
);

doctorsRouter.use(authenticate, requireRole(Role.PATIENT));

doctorsRouter.get("/", doctorsController.listDoctors);
doctorsRouter.get("/:doctorId/availability", doctorsController.getAvailability);
doctorsRouter.get("/:doctorId", doctorsController.getDoctor);
