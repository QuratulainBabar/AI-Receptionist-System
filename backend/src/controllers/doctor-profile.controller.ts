import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as doctorProfileService from "../services/doctor-profile.service.js";
import { queueDirectorySync } from "../services/clinic-synthflow.service.js";
import { AppError } from "../utils/AppError.js";
import { WEEKDAYS } from "../utils/doctor-profile.js";

const weeklyHourSchema = z.object({
  day: z.enum(WEEKDAYS),
  enabled: z.boolean(),
  startTime: z.string().trim().min(1).max(16),
  endTime: z.string().trim().min(1).max(16),
});

const updateBodySchema = z.object({
  specialtyId: z.string().trim().min(1).optional(),
  subSpecialty: z.string().trim().max(120).optional(),
  qualifications: z.union([z.array(z.string()), z.string()]).optional(),
  certifications: z.union([z.array(z.string()), z.string()]).optional(),
  experienceYears: z.coerce.number().int().min(0).max(80).optional(),
  about: z.string().trim().max(4000).optional(),
  areasOfExpertise: z.union([z.array(z.string()), z.string()]).optional(),
  clinic: z.string().trim().max(200).optional(),
  fee: z.string().trim().max(40).optional(),
  consultationType: z.enum(["In clinic", "Video call", "Both"]).optional(),
  languages: z.union([z.array(z.string()), z.string()]).optional(),
  location: z.string().trim().max(240).optional(),
  weeklyHours: z.array(weeklyHourSchema).optional(),
});

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const profile = await doctorProfileService.getDoctorProfileForDoctor(req.user.sub);
    res.json({ success: true, profile });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const body = updateBodySchema.parse(req.body ?? {});
    const profile = await doctorProfileService.updateDoctorProfileForDoctor(req.user.sub, body);
    queueDirectorySync("doctor-profile-save");
    res.json({ success: true, profile, message: "Doctor profile saved." });
  } catch (error) {
    next(error);
  }
}
