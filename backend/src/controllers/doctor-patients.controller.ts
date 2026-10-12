import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import { z } from "zod";
import * as doctorPatientsService from "../services/doctor-patients.service.js";
import * as recordsService from "../services/records.service.js";
import { addClinicalNote, addDoctorPrescription } from "../services/patient-chart.service.js";
import { AppError } from "../utils/AppError.js";

const noteBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  appointmentId: z.string().trim().min(1).optional(),
});

const prescriptionBodySchema = z.object({
  medication: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(200).optional(),
  instructions: z.string().trim().max(2000).optional(),
  appointmentId: z.string().trim().min(1).optional(),
});

const createPatientBodySchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(7).max(30),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => {
      const trimmed = (value ?? "").trim().toLowerCase();
      return trimmed || undefined;
    })
    .refine(
      (value) => value === undefined || z.string().email().safeParse(value).success,
      "Enter a valid email",
    ),
  age: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((value) => {
      if (value === null || value === undefined || value === "") return null;
      const parsed = typeof value === "number" ? value : Number(value);
      return Number.isFinite(parsed) ? Math.round(parsed) : null;
    })
    .refine(
      (value) => value === null || (Number.isInteger(value) && value >= 1 && value <= 130),
      "Enter a valid age between 1 and 130",
    ),
  gender: z.string().trim().max(40).optional(),
  condition: z.string().trim().max(200).optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const patients = await doctorPatientsService.listPatientsForDoctor(req.user.sub, q);
    res.json({ success: true, patients });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const body = createPatientBodySchema.parse(req.body ?? {});
    const result = await doctorPatientsService.createPatientForDoctor(req.user.sub, {
      fullName: body.fullName,
      phone: body.phone,
      email: body.email,
      age: body.age ?? null,
      gender: body.gender,
      condition: body.condition,
    });
    res.status(result.created ? 201 : 200).json({
      success: true,
      patient: result.patient,
      created: result.created,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const patientId = String(req.params.patientId);
    const body = createPatientBodySchema.parse(req.body ?? {});
    const result = await doctorPatientsService.updatePatientForDoctor(req.user.sub, patientId, {
      fullName: body.fullName,
      phone: body.phone,
      email: body.email,
      age: body.age ?? null,
      gender: body.gender,
      condition: body.condition,
    });
    res.json({
      success: true,
      patient: result.patient,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const patientId = String(req.params.patientId);
    const deleted = await doctorPatientsService.deletePatientForDoctor(req.user.sub, patientId);
    res.json({
      success: true,
      deleted,
      message: `${deleted.fullName} has been deleted.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const patientId = String(req.params.patientId);
    const file = await doctorPatientsService.getPatientFileForDoctor(req.user.sub, patientId);
    res.json({ success: true, ...file });
  } catch (error) {
    next(error);
  }
}

export async function addNote(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const patientId = String(req.params.patientId);
    const body = noteBodySchema.parse(req.body ?? {});
    await addClinicalNote({
      doctorUserId: req.user.sub,
      patientId,
      appointmentId: body.appointmentId,
      body: body.body,
    });
    const file = await doctorPatientsService.getPatientFileForDoctor(req.user.sub, patientId);
    res.status(201).json({ success: true, ...file, message: "Note saved on the patient timeline." });
  } catch (error) {
    next(error);
  }
}

export async function addPrescription(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const patientId = String(req.params.patientId);
    const body = prescriptionBodySchema.parse(req.body ?? {});
    await addDoctorPrescription({
      doctorUserId: req.user.sub,
      patientId,
      appointmentId: body.appointmentId,
      medication: body.medication,
      dosage: body.dosage,
      instructions: body.instructions,
    });
    const file = await doctorPatientsService.getPatientFileForDoctor(req.user.sub, patientId);
    res.status(201).json({ success: true, ...file, message: "Prescription saved on the patient timeline." });
  } catch (error) {
    next(error);
  }
}

export async function viewRecordFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const patientId = String(req.params.patientId);
    const recordId = String(req.params.recordId);
    const { record, absolutePath } = await recordsService.getRecordFileForDoctor({
      doctorUserId: req.user.sub,
      patientId,
      recordId,
    });

    res.setHeader("Content-Type", record.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(record.fileName)}"`);
    fs.createReadStream(absolutePath).pipe(res);
  } catch (error) {
    next(error);
  }
}
