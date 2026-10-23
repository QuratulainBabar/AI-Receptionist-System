import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  attachClinicContext,
  requireClinicPermission,
} from "../middleware/clinic-context.js";
import { requireDoctorReady } from "../middleware/enrollment.js";
import * as appointmentsController from "../controllers/appointments.controller.js";

export const doctorAppointmentsRouter = Router();

doctorAppointmentsRouter.use(
  authenticate,
  requireRole(Role.DOCTOR, Role.CLINIC_STAFF),
  attachClinicContext,
  requireDoctorReady,
);

doctorAppointmentsRouter.get(
  "/",
  requireClinicPermission("appointments", "followUps"),
  appointmentsController.listForDoctor,
);
doctorAppointmentsRouter.get(
  "/:appointmentId",
  requireClinicPermission("appointments", "followUps"),
  appointmentsController.getOneForDoctor,
);
doctorAppointmentsRouter.patch(
  "/:appointmentId/status",
  requireClinicPermission("appointments"),
  appointmentsController.updateStatusForDoctor,
);
doctorAppointmentsRouter.post(
  "/:appointmentId/reschedule",
  requireClinicPermission("appointments"),
  appointmentsController.rescheduleForDoctor,
);
doctorAppointmentsRouter.delete(
  "/:appointmentId",
  requireClinicPermission("appointments"),
  appointmentsController.deleteForDoctor,
);
doctorAppointmentsRouter.post(
  "/:appointmentId/follow-up",
  requireClinicPermission("followUps", "appointments"),
  appointmentsController.createFollowUpForDoctor,
);
doctorAppointmentsRouter.get(
  "/:appointmentId/invoice/preview",
  requireClinicPermission("invoices"),
  appointmentsController.previewInvoiceForDoctor,
);
doctorAppointmentsRouter.post(
  "/:appointmentId/invoice",
  requireClinicPermission("invoices"),
  appointmentsController.sendInvoiceForDoctor,
);
