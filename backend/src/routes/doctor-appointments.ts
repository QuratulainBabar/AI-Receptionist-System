import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { requireDoctorReady } from "../middleware/enrollment.js";
import * as appointmentsController from "../controllers/appointments.controller.js";

export const doctorAppointmentsRouter = Router();

doctorAppointmentsRouter.use(authenticate, requireRole(Role.DOCTOR), requireDoctorReady);

doctorAppointmentsRouter.get("/", appointmentsController.listForDoctor);
doctorAppointmentsRouter.get("/:appointmentId", appointmentsController.getOneForDoctor);
doctorAppointmentsRouter.patch(
  "/:appointmentId/status",
  appointmentsController.updateStatusForDoctor,
);
doctorAppointmentsRouter.post(
  "/:appointmentId/follow-up",
  appointmentsController.createFollowUpForDoctor,
);
doctorAppointmentsRouter.post(
  "/:appointmentId/invoice",
  appointmentsController.sendInvoiceForDoctor,
);
