import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  attachClinicContext,
  requireClinicOwner,
  requireClinicPermission,
} from "../middleware/clinic-context.js";
import { requireDoctorEnrollment } from "../middleware/enrollment.js";
import { AppError } from "../utils/AppError.js";
import * as doctorProfileController from "../controllers/doctor-profile.controller.js";

export const doctorProfileRouter = Router();

doctorProfileRouter.use(
  authenticate,
  requireRole(Role.DOCTOR, Role.CLINIC_STAFF),
  attachClinicContext,
  requireDoctorEnrollment,
);

doctorProfileRouter.get("/", requireClinicPermission("clinicSettings"), doctorProfileController.getProfile);
doctorProfileRouter.put("/", requireClinicOwner, doctorProfileController.updateProfile);

function handlePhotoUpload(req: Request, res: Response, next: NextFunction) {
  doctorProfileController.photoUploadMiddleware(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError) {
      next(new AppError(400, error.message));
      return;
    }
    next(error);
  });
}

doctorProfileRouter.post(
  "/photo",
  requireClinicOwner,
  handlePhotoUpload,
  doctorProfileController.uploadPhoto,
);
doctorProfileRouter.delete("/photo", requireClinicOwner, doctorProfileController.removePhoto);
