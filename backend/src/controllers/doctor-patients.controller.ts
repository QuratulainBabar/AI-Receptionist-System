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
