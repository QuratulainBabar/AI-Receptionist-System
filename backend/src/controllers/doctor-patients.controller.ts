import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import * as doctorPatientsService from "../services/doctor-patients.service.js";
import * as recordsService from "../services/records.service.js";
import { AppError } from "../utils/AppError.js";

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
