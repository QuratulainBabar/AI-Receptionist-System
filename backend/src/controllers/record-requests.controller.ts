import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { AppError } from "../utils/AppError.js";
import * as recordRequestsService from "../services/record-requests.service.js";
import * as recordsService from "../services/records.service.js";

const ALLOWED_MIME = new Set(["application/pdf", "image/jpeg", "image/png", "image/jpg"]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, recordsService.getUploadRoot());
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

export const publicUploadMiddleware = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new AppError(400, "Only PDF, JPG or PNG files are allowed"));
      return;
    }
    cb(null, true);
  },
}).single("file");

export async function requestForAppointment(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const appointmentId = String(req.params.appointmentId);
    const result = await recordRequestsService.requestRecordsForAppointment({
      doctorUserId: req.user.sub,
      appointmentId,
    });
    res.status(201).json({ success: true, request: result, message: result.message });
  } catch (error) {
    next(error);
  }
}

export async function showUploadPage(req: Request, res: Response) {
  const token = String(req.params.token || "");
  try {
    const resolved = await recordRequestsService.resolveRecordRequestByToken(token);
    res
      .status(200)
      .type("html")
      .send(
        recordRequestsService.renderUploadPageHtml({
          token,
          patientName: resolved.request.patientName,
          doctorName: resolved.request.doctorName,
          appointmentReference: resolved.request.appointmentReference,
          expiresAt: resolved.request.expiresAt,
          categories: resolved.categories,
        }),
      );
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : "This upload link is not available.";
    const status = error instanceof AppError ? error.statusCode : 500;
    res.status(status).type("html").send(recordRequestsService.renderUploadErrorPage(message));
  }
}

export async function uploadViaToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = String(req.params.token || "");
    if (!req.file) throw new AppError(400, "Choose a PDF, JPG or PNG file to upload");

    const relativePath = path
      .relative(recordsService.getUploadRoot(), req.file.path)
      .replace(/\\/g, "/");

    const record = await recordRequestsService.uploadRecordViaToken({
      rawToken: token,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      storagePath: relativePath,
      category: typeof req.body.category === "string" ? req.body.category : undefined,
    });

    res.status(201).json({ success: true, record, message: "Record uploaded" });
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    next(error);
  }
}
