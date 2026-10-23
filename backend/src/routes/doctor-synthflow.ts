import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  attachClinicContext,
  requireClinicOwner,
  requireClinicPermission,
} from "../middleware/clinic-context.js";
import { requireDoctorEnrollment } from "../middleware/enrollment.js";
import * as clinicSynthflowController from "../controllers/clinic-synthflow.controller.js";

export const doctorSynthflowRouter = Router();

doctorSynthflowRouter.use(
  authenticate,
  requireRole(Role.DOCTOR, Role.CLINIC_STAFF),
  attachClinicContext,
  requireDoctorEnrollment,
);

doctorSynthflowRouter.get(
  "/",
  requireClinicPermission("callTranscriptions", "clinicSettings"),
  clinicSynthflowController.getSynthflowConfig,
);
doctorSynthflowRouter.put("/", requireClinicOwner, clinicSynthflowController.updateSynthflowConfig);
doctorSynthflowRouter.post("/agent", requireClinicOwner, clinicSynthflowController.createOrUpdateAgent);
doctorSynthflowRouter.post("/sync", requireClinicOwner, clinicSynthflowController.syncDirectory);
doctorSynthflowRouter.get(
  "/call-health",
  requireClinicPermission("callTranscriptions", "clinicSettings"),
  clinicSynthflowController.getCallHealth,
);
doctorSynthflowRouter.post("/test-call", requireClinicOwner, clinicSynthflowController.startTestCall);
doctorSynthflowRouter.get(
  "/test-call/:callId",
  requireClinicPermission("callTranscriptions", "clinicSettings"),
  clinicSynthflowController.getTestCall,
);
