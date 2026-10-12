import { Router, type NextFunction, type Request, type Response } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { attachClinicContext } from "../middleware/clinic-context.js";
import { requireDoctorEnrollment } from "../middleware/enrollment.js";
import { AppError } from "../utils/AppError.js";
import * as doctorSettingsController from "../controllers/doctor-settings.controller.js";

export const doctorSettingsRouter = Router();

function requireDoctorAccount(req: Request, _res: Response, next: NextFunction) {
  if (!req.clinicContext?.isOwner) {
    return next(new AppError(403, "Only the clinic doctor can change these settings."));
  }
  return next();
}

doctorSettingsRouter.use(
  authenticate,
  requireRole(Role.DOCTOR, Role.CLINIC_STAFF),
  attachClinicContext,
  requireDoctorEnrollment,
  requireDoctorAccount,
);

doctorSettingsRouter.get("/sms-preferences", doctorSettingsController.getSmsPreferences);
doctorSettingsRouter.put("/sms-preferences", doctorSettingsController.updateSmsPreferences);
