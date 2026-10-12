import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import * as authService from "../services/auth.service.js";
import * as adminClinicService from "../services/admin-clinic.service.js";
import * as adminDoctorService from "../services/admin-doctor.service.js";
import * as appointmentsService from "../services/appointments.service.js";
import * as doctorAvailabilityService from "../services/doctor-availability.service.js";
import * as doctorProfileService from "../services/doctor-profile.service.js";
import { WEEKDAYS } from "../utils/doctor-profile.js";
import { AppError } from "../utils/AppError.js";

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["active", "inactive", "all"]).optional().default("all"),
});

const doctorListQuerySchema = listQuerySchema.extend({
  verification: z.enum(["verified", "unverified", "all"]).optional().default("all"),
});

const clinicListQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const statusBodySchema = z.object({
  isActive: z.boolean(),
});

const appointmentStatusBodySchema = z.object({
  status: z.enum(["confirmed", "pending", "completed", "cancelled"]),
});

const rescheduleBodySchema = z.object({
  slotId: z.string().min(1),
});

const weeklyHourSchema = z.object({
  day: z.enum(WEEKDAYS),
  enabled: z.boolean(),
  startTime: z.string().trim().min(1).max(16),
  endTime: z.string().trim().min(1).max(16),
  sessions: z
    .array(
      z.object({
        startTime: z.string().trim().min(1).max(16),
        endTime: z.string().trim().min(1).max(16),
      }),
    )
    .max(8)
    .optional(),
});

const doctorCrmBodySchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  specialtyId: z.string().trim().min(1).optional(),
  specialty: z.string().trim().min(1).max(120).optional(),
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

const createDoctorBodySchema = doctorCrmBodySchema.extend({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  isActive: z.boolean().optional().default(true),
  isVerified: z.boolean().optional().default(false),
  verificationNote: z.string().trim().max(1000).optional(),
});

const verificationBodySchema = z.object({
  isVerified: z.boolean(),
  verificationNote: z.string().trim().max(1000).optional(),
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

export const doctorPhotoUploadMiddleware = multer({
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

const adminPhotoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, authService.getUserPhotoUploadRoot());
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  },
});

export const adminPhotoUploadMiddleware = multer({
  storage: adminPhotoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!PHOTO_MIME.has(file.mimetype)) {
      cb(new AppError(400, "Only JPG, PNG, or WebP images are allowed"));
      return;
    }
    cb(null, true);
  },
}).single("photo");

export async function stats(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await authService.getAdminStats();
    res.json({ success: true, stats: data });
  } catch (error) {
    next(error);
  }
}

export async function listDoctors(req: Request, res: Response, next: NextFunction) {
  try {
    const query = doctorListQuerySchema.parse(req.query);
    const result = await adminDoctorService.listDoctorsForAdmin({
      q: query.q,
      status: query.status,
      verification: query.verification,
    });
    res.json({ success: true, users: result.users, summary: result.summary });
  } catch (error) {
    next(error);
  }
}

export async function createDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const body = createDoctorBodySchema.parse(req.body ?? {});
    const {
      fullName,
      email,
      password,
      isActive,
      isVerified,
      verificationNote,
      phone,
      ...profile
    } = body;
    const data = await adminDoctorService.createDoctorForAdmin({
      fullName,
      email,
      password,
      isActive,
      phone,
      isVerified,
      verificationNote,
      adminUserId: req.user.sub,
      profile: { ...profile, phone },
    });
    res.status(201).json({
      success: true,
      ...data,
      message: `Doctor account created for ${data.user.fullName}.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = String(req.params.userId);
    const deleted = await adminDoctorService.deleteDoctorForAdmin(userId);
    res.json({
      success: true,
      deleted,
      message: `${deleted.fullName} has been deleted.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadDoctorPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = String(req.params.userId);
    if (!req.file) throw new AppError(400, "Choose a profile photo to upload");
    const profile = await adminDoctorService.uploadDoctorPhotoForAdmin(userId, req.file);
    res.json({ success: true, profile, message: "Doctor profile photo updated." });
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    next(error);
  }
}

export async function getDoctorCrm(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = String(req.params.userId);
    const data = await adminDoctorService.getDoctorCrmForAdmin(userId);
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
}

export async function updateDoctorCrm(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = String(req.params.userId);
    const body = doctorCrmBodySchema.parse(req.body ?? {});
    const data = await adminDoctorService.updateDoctorCrmForAdmin(userId, body);
    res.json({ success: true, ...data, message: "Doctor CRM profile saved and synced to the phone AI." });
  } catch (error) {
    next(error);
  }
}

export async function setDoctorVerification(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const userId = String(req.params.userId);
    const body = verificationBodySchema.parse(req.body ?? {});
    const data = await adminDoctorService.setDoctorVerificationForAdmin({
      userId,
      isVerified: body.isVerified,
      verificationNote: body.verificationNote,
      adminUserId: req.user.sub,
    });
    res.json({
      success: true,
      ...data,
      message: body.isVerified ? "Doctor marked as verified." : "Doctor verification removed.",
    });
  } catch (error) {
    next(error);
  }
}

export async function listPatients(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const users = await authService.listUsersByRole({
      role: "patient",
      q: query.q,
      status: query.status,
    });
    res.json({ success: true, users });
  } catch (error) {
    next(error);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = String(req.params.userId);
    const user = await authService.getManagedUser(userId);
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
}

export async function setStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const body = statusBodySchema.parse(req.body);
    const userId = String(req.params.userId);
    const user = await authService.setUserActiveStatus(userId, body.isActive);
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
}

const profileBodySchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().max(40).optional(),
});

const systemUsersQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["active", "inactive", "all"]).optional().default("all"),
  role: z.enum(["all", "doctor", "patient", "clinic_staff", "admin"]).optional().default("all"),
});

const createUserBodySchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8).max(128),
  role: z.enum(["patient", "doctor"]),
});

export async function getSettingsProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const user = await authService.getCurrentUser(req.user.sub);
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
}

export async function updateSettingsProfile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const body = profileBodySchema.parse(req.body ?? {});
    const user = await authService.updateOwnProfile(req.user.sub, body);
    res.json({ success: true, user, message: "Profile settings saved." });
  } catch (error) {
    next(error);
  }
}

export async function uploadSettingsPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    if (!req.file) throw new AppError(400, "Choose a profile photo to upload");
    const user = await authService.updateOwnPhoto(req.user.sub, req.file);
    res.json({ success: true, user, message: "Profile photo updated." });
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    next(error);
  }
}

export async function removeSettingsPhoto(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const user = await authService.removeOwnPhoto(req.user.sub);
    res.json({ success: true, user, message: "Profile photo removed." });
  } catch (error) {
    next(error);
  }
}

export async function listSystemUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const query = systemUsersQuerySchema.parse(req.query);
    const users = await authService.listSystemUsers(query);
    res.json({ success: true, users });
  } catch (error) {
    next(error);
  }
}

export async function createSystemUser(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createUserBodySchema.parse(req.body ?? {});
    const user = await authService.createManagedUser(body);
    res.status(201).json({
      success: true,
      user,
      message: `${user.systemRoleLabel} account created for ${user.fullName}.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function listVoiceCalls(req: Request, res: Response, next: NextFunction) {
  try {
    const query = clinicListQuerySchema.parse(req.query);
    const calls = await adminClinicService.listVoiceCallsForAdmin(query);
    res.json({ success: true, calls });
  } catch (error) {
    next(error);
  }
}

export async function getVoiceCall(req: Request, res: Response, next: NextFunction) {
  try {
    const callId = String(req.params.callId || req.params.id);
    const call = await adminClinicService.getVoiceCallForAdmin(callId);
    res.json({ success: true, call });
  } catch (error) {
    next(error);
  }
}

export async function streamVoiceCallRecording(req: Request, res: Response, next: NextFunction) {
  try {
    const callId = String(req.params.callId || req.params.id);
    const source = await adminClinicService.getVoiceCallRecordingSource(callId);

    const upstream = await fetch(source.recordingUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "audio/*,application/octet-stream,*/*",
      },
    });

    if (!upstream.ok) {
      throw new AppError(
        upstream.status === 404 ? 404 : 502,
        upstream.status === 404
          ? "Recording file was not found at Synthflow"
          : `Unable to fetch recording from Synthflow (${upstream.status})`,
      );
    }

    const contentType = upstream.headers.get("content-type") || "audio/mpeg";
    const contentLength = upstream.headers.get("content-length");
    const contentDisposition =
      upstream.headers.get("content-disposition") ||
      `inline; filename="voice-call-${source.id}.mp3"`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", contentDisposition);
    res.setHeader("Cache-Control", "private, max-age=300");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
}

export async function listAppointments(req: Request, res: Response, next: NextFunction) {
  try {
    const query = clinicListQuerySchema.parse(req.query);
    const appointments = await adminClinicService.listAppointmentsForAdmin(query);
    res.json({ success: true, appointments });
  } catch (error) {
    next(error);
  }
}

export async function getAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const appointmentId = String(req.params.appointmentId);
    const appointment = await adminClinicService.getAppointmentForAdmin(appointmentId);
    res.json({ success: true, appointment });
  } catch (error) {
    next(error);
  }
}

export async function updateAppointmentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const appointmentId = String(req.params.appointmentId);
    const body = appointmentStatusBodySchema.parse(req.body ?? {});
    const appointment = await appointmentsService.updateAppointmentStatusForAdmin(
      appointmentId,
      body.status,
    );
    res.json({
      success: true,
      appointment,
      message: `Appointment marked as ${body.status}.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function rescheduleAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    const appointmentId = String(req.params.appointmentId);
    const body = rescheduleBodySchema.parse(req.body ?? {});
    const appointment = await appointmentsService.rescheduleAppointmentForAdmin(
      appointmentId,
      body.slotId,
    );
    res.json({
      success: true,
      appointment,
      message: "Appointment rescheduled.",
    });
  } catch (error) {
    next(error);
  }
}

export async function listDoctorOpenSlots(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = String(req.params.userId);
    const slots = await appointmentsService.listOpenSlotsForDoctorAdmin(userId);
    res.json({ success: true, slots });
  } catch (error) {
    next(error);
  }
}

const generateSlotsBodySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(8).optional(),
});

export async function generateDoctorSlots(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = String(req.params.userId);
    const body = generateSlotsBodySchema.parse(req.body ?? {});
    const result = await doctorAvailabilityService.generateSlotsFromWeeklyHours(userId, {
      weeks: body.weeks,
      requireActive: false,
    });
    res.json({
      success: true,
      ...result,
      message: `Created ${result.created} open slot${result.created === 1 ? "" : "s"} from weekly hours.`,
    });
  } catch (error) {
    next(error);
  }
}
