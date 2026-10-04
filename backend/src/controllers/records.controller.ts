import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
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

export const uploadMiddleware = multer({
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

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const records = await recordsService.listRecordsForPatient(req.user.sub);
    res.json({ success: true, records });
  } catch (error) {
    next(error);
  }
}

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    if (!req.file) throw new AppError(400, "Choose a PDF, JPG or PNG file to upload");

    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user || user.role !== "PATIENT" || !user.isActive) {
      fs.unlink(req.file.path, () => undefined);
      throw new AppError(403, "Only active patients can upload records");
    }

    const relativePath = path.relative(recordsService.getUploadRoot(), req.file.path).replace(/\\/g, "/");
    const record = await recordsService.createRecordForPatient({
      userId: user.id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      storagePath: relativePath,
      uploadedBy: user.fullName,
      category: typeof req.body.category === "string" ? req.body.category : undefined,
    });

    res.status(201).json({ success: true, record, message: "Record uploaded" });
  } catch (error) {
    if (req.file?.path) fs.unlink(req.file.path, () => undefined);
    next(error);
  }
}

export async function viewFile(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const recordId = String(req.params.recordId);
    const { record, absolutePath } = await recordsService.getRecordFileForPatient(recordId, req.user.sub);

    res.setHeader("Content-Type", record.mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(record.fileName)}"`);
    fs.createReadStream(absolutePath).pipe(res);
  } catch (error) {
    next(error);
  }
}
