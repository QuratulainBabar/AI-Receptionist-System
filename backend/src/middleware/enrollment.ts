import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { isDoctorEnrolled, isDoctorReady } from "../services/subscription.service.js";

function scopeDoctorUserId(req: Request) {
  return req.clinicContext?.ownerDoctorUserId || req.user?.sub;
}

export function requireDoctorEnrollment(req: Request, _res: Response, next: NextFunction) {
  const userId = scopeDoctorUserId(req);
  if (!userId) {
    next(new AppError(401, "Authentication required"));
    return;
  }
  isDoctorEnrolled(userId)
    .then((enrolled) => {
      if (!enrolled) {
        next(new AppError(402, "Complete subscription payment before using the doctor portal."));
        return;
      }
      next();
    })
    .catch(next);
}

export function requireDoctorReady(req: Request, _res: Response, next: NextFunction) {
  const userId = scopeDoctorUserId(req);
  if (!userId) {
    next(new AppError(401, "Authentication required"));
    return;
  }
  isDoctorReady(userId)
    .then((ready) => {
      if (!ready) {
        next(
          new AppError(
            402,
            "Finish your profile and availability before using this part of the clinic.",
          ),
        );
        return;
      }
      next();
    })
    .catch(next);
}
