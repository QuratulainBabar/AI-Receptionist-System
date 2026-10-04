import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as adminController from "../controllers/admin.controller.js";
import * as clinicSynthflowController from "../controllers/clinic-synthflow.controller.js";

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole(Role.SUPER_ADMIN));

adminRouter.get("/stats", adminController.stats);
adminRouter.get("/voice-calls", adminController.listVoiceCalls);
adminRouter.get("/voice-calls/:callId/recording", adminController.streamVoiceCallRecording);
adminRouter.get("/voice-calls/:callId", adminController.getVoiceCall);
adminRouter.get("/appointments", adminController.listAppointments);
adminRouter.patch("/appointments/:appointmentId/status", adminController.updateAppointmentStatus);
adminRouter.post("/appointments/:appointmentId/reschedule", adminController.rescheduleAppointment);
adminRouter.get("/doctors", adminController.listDoctors);
adminRouter.get("/doctors/:userId/crm", adminController.getDoctorCrm);
adminRouter.put("/doctors/:userId/crm", adminController.updateDoctorCrm);
adminRouter.patch("/doctors/:userId/verification", adminController.setDoctorVerification);
adminRouter.get("/doctors/:userId/slots", adminController.listDoctorOpenSlots);
adminRouter.get("/patients", adminController.listPatients);
adminRouter.get("/users/:userId", adminController.getUser);
adminRouter.patch("/users/:userId/status", adminController.setStatus);

/** Clinic Synthflow phone AI configuration (restaurant-style) */
adminRouter.get("/synthflow", clinicSynthflowController.getSynthflowConfig);
adminRouter.put("/synthflow", clinicSynthflowController.updateSynthflowConfig);
adminRouter.post("/synthflow/agent", clinicSynthflowController.createOrUpdateAgent);
adminRouter.post("/synthflow/sync", clinicSynthflowController.syncDirectory);
