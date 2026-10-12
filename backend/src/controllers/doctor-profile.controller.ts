import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import * as doctorProfileService from "../services/doctor-profile.service.js";
import { generateSlotsFromWeeklyHours } from "../services/doctor-availability.service.js";
import { syncPromptAfterAvailabilityChange } from "../services/clinic-synthflow.service.js";
import { AppError } from "../utils/AppError.js";
import { WEEKDAYS } from "../utils/doctor-profile.js";

const sessionSchema = z.object({
  startTime: z.string().trim().min(1).max(16),
  endTime: z.string().trim().min(1).max(16),
});

const weeklyHourSchema = z.object({
  day: z.enum(WEEKDAYS),
  enabled: z.boolean(),
  startTime: z.string().trim().min(1).max(16),
  endTime: z.string().trim().min(1).max(16),
  sessions: z.array(sessionSchema).max(8).optional(),
});

const dateOverrideSchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["unavailable", "custom"]),
  sessions: z.array(sessionSchema).max(8).optional(),
  breaks: z.array(sessionSchema).max(8).optional(),
});

const availabilityConfigSchema = z.object({
  version: z.literal(2).optional(),
  slotDurationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
  scheduleFrom: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  scheduleTo: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  days: z.array(weeklyHourSchema).min(7).max(7),
  dateOverrides: z.array(dateOverrideSchema).max(366).optional(),
});

const listField = z.union([z.array(z.string().trim().max(200)), z.string().max(4000)]);

const updateBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  specialtyId: z.string().trim().min(1).optional(),
  specialty: z.string().trim().min(1).max(120).optional(),
  subSpecialty: z.string().trim().max(120).optional(),
  qualifications: listField.optional(),
  certifications: listField.optional(),
  experienceYears: z.coerce.number().int().min(0).max(80).optional(),
  about: z.string().trim().max(4000).optional(),
  areasOfExpertise: listField.optional(),
  clinic: z.string().trim().max(200).optional(),
  fee: z.string().trim().max(40).optional(),
  feeCurrency: z
    .enum(["USD", "PKR", "EUR", "GBP", "AED", "INR", "CAD", "AUD"])
    .optional(),
  consultationType: z.enum(["In clinic", "Video call", "Both"]).optional(),
  consultationServices: listField.optional(),
  languages: listField.optional(),
  location: z.string().trim().max(240).optional(),
  weeklyHours: z.array(weeklyHourSchema).optional(),
  availabilityConfig: availabilityConfigSchema.optional(),
});

const PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/jpg", "image/webp"]);

const photoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, doctorProfileService.getDoctorPhotoUploadRoot());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  },
});

export const photoUploadMiddleware = multer({
  storage: photoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!PHOTO_MIME.has(file.mimetype)) {
      cb(new AppError(400, "Only JPG, PNG, or WebP images are allowed"));
      return;
    }
    cb(null, true);
  },
}).single("photo");

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
    // Availability alone is not bookable — materialize open slots for the phone agent.
    if (body.availabilityConfig !== undefined || body.weeklyHours !== undefined) {
      await generateSlotsFromWeeklyHours(req.user.sub, {
        weeks: 2,
        allowEmpty: true,
        replaceOpen: true,
      });
    }
    const sync = await syncPromptAfterAvailabilityChange("doctor-profile-save");
    res.json({
      success: true,
      profile,
      message: sync.synced
        ? "Doctor profile saved and AI receptionist updated."
        : "Doctor profile saved.",
      synthflowSynced: sync.synced,
      openSlotsSummary: sync.openSlotsSummary,
      warning: sync.warning,
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    if (!req.file) throw new AppError(400, "Choose a profile photo to upload");
    const profile = await doctorProfileService.updateDoctorPhotoForDoctor(req.user.sub, req.file);
    const sync = await syncPromptAfterAvailabilityChange("doctor-profile-photo");
    res.json({
      success: true,
      profile,
      message: "Profile photo updated.",
      synthflowSynced: sync.synced,
      warning: sync.warning,
    });
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    next(error);
  }
}

export async function removePhoto(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const profile = await doctorProfileService.removeDoctorPhotoForDoctor(req.user.sub);
    res.json({ success: true, profile, message: "Profile photo removed." });
  } catch (error) {
    next(error);
  }
}
