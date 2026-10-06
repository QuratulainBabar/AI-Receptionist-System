import { Router } from "express";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { requireDoctorReady } from "../middleware/enrollment.js";
import { AppError } from "../utils/AppError.js";
import * as recordRequestsController from "../controllers/record-requests.controller.js";

export const doctorRecordRequestsRouter = Router({ mergeParams: true });

doctorRecordRequestsRouter.use(authenticate, requireRole(Role.DOCTOR), requireDoctorReady);
doctorRecordRequestsRouter.post("/", recordRequestsController.requestForAppointment);

export const publicRecordUploadsRouter = Router();

function handlePublicUpload(req: Request, res: Response, next: NextFunction) {
  recordRequestsController.publicUploadMiddleware(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return next(new AppError(400, "File must be 10 MB or smaller"));
      }
      return next(new AppError(400, error.message));
    }
    return next(error);
  });
}

publicRecordUploadsRouter.post(
  "/:token",
  handlePublicUpload,
  recordRequestsController.uploadViaToken,
);
