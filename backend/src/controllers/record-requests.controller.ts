import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { AppError } from "../utils/AppError.js";
import * as recordRequestsService from "../services/record-requests.service.js";
import * as recordsService from "../services/records.service.js";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/jpg",
]);

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
  limits: { fileSize: 10 * 1024 * 1024, files: 24 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype) && !file.mimetype.startsWith("image/")) {
      cb(new AppError(400, "Only PDF, JPG or PNG files are allowed"));
      return;
    }
    if (
      !ALLOWED_MIME.has(file.mimetype) &&
      file.mimetype.startsWith("image/") &&
      file.mimetype !== "image/jpeg" &&
      file.mimetype !== "image/png" &&
      file.mimetype !== "image/jpg"
    ) {
      // Some phone cameras send image/webp or image/heic — reject clearly.
      cb(new AppError(400, "Only PDF, JPG or PNG files are allowed"));
      return;
    }
    cb(null, true);
  },
}).fields([
  { name: "files", maxCount: 12 },
  { name: "images", maxCount: 12 },
  // Legacy single-file field from older upload page
  { name: "file", maxCount: 1 },
]);

function relativeUploadPath(absolutePath: string) {
  return path.relative(recordsService.getUploadRoot(), absolutePath).replace(/\\/g, "/");
}

function cleanupFiles(files: Express.Multer.File[]) {
  for (const file of files) {
    if (file.path) fs.unlink(file.path, () => undefined);
  }
}

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
  const fieldFiles = req.files as
    | { [fieldname: string]: Express.Multer.File[] }
    | Express.Multer.File[]
    | undefined;
  const grouped =
    fieldFiles && !Array.isArray(fieldFiles)
      ? fieldFiles
      : { files: Array.isArray(fieldFiles) ? fieldFiles : [] };
  const allDiskFiles = [
    ...(grouped.files || []),
    ...(grouped.images || []),
    ...(grouped.file || []),
  ];

  try {
    const token = String(req.params.token || "");
    const notes = typeof req.body.notes === "string" ? req.body.notes : "";
    const category = typeof req.body.category === "string" ? req.body.category : undefined;

    const legacy = grouped.file || [];
    const docs = [...(grouped.files || []), ...legacy.filter((f) => !f.mimetype.startsWith("image/"))];
    const images = [
      ...(grouped.images || []),
      ...legacy.filter((f) => f.mimetype.startsWith("image/")),
    ];

    if (!docs.length && !images.length && !notes.trim()) {
      throw new AppError(400, "Add at least one file, image, or note before submitting.");
    }

    console.log(
      `[records] Upload activity started token=${token.slice(0, 8)}… docs=${docs.length} images=${images.length} notes=${notes.trim() ? "yes" : "no"}`,
    );

    const records = await recordRequestsService.uploadBatchViaToken({
      rawToken: token,
      files: docs.map((file) => ({
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: relativeUploadPath(file.path),
      })),
      images: images.map((file) => ({
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: relativeUploadPath(file.path),
      })),
      notes,
      category,
    });

    console.log(
      `[records] Upload activity completed token=${token.slice(0, 8)}… saved=${records.length}`,
    );

    res.status(201).json({
      success: true,
      records,
      record: records[0] || null,
      message: "Records uploaded",
    });
  } catch (error) {
    console.warn(
      `[records] Upload activity failed token=${String(req.params.token || "").slice(0, 8)}…:`,
      error instanceof Error ? error.message : error,
    );
    cleanupFiles(allDiskFiles);
    next(error);
  }
}
