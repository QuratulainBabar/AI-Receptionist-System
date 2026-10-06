import fs from "node:fs";
import path from "node:path";
import type { PatientMedicalRecord } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { logReportUploaded } from "./activity.service.js";
import { logReportUploadedForDoctors } from "./notifications.service.js";

export type PublicMedicalRecord = {
  id: string;
  name: string;
  type: string;
  date: string;
  size: string;
  uploadedBy: string;
  mimeType: string;
  appointmentId: string | null;
  appointmentReference: string | null;
  appointmentDate: string | null;
};

const UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "records");

export function getUploadRoot() {
  fs.mkdirSync(UPLOAD_ROOT, { recursive: true });
  return UPLOAD_ROOT;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatRecordDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function inferCategory(fileName: string, mimeType: string) {
  const lower = fileName.toLowerCase();
  if (lower.includes("ecg") || lower.includes("ekg")) return "ECG";
  if (lower.includes("blood") || lower.includes("lab") || lower.includes("panel")) return "Lab result";
  if (
    lower.includes("xray") ||
    lower.includes("x-ray") ||
    lower.includes("scan") ||
    lower.includes("imaging") ||
    mimeType.startsWith("image/")
  ) {
    return "Imaging";
  }
  if (lower.includes("prescription") || lower.includes("rx")) return "Prescription";
  return "Report";
}

function toPublic(
  record: PatientMedicalRecord & {
    appointment?: { id: string; reference: string; startsAt: Date } | null;
  },
): PublicMedicalRecord {
  return {
    id: record.id,
    name: record.fileName,
    type: record.category,
    date: formatRecordDate(record.createdAt),
    size: formatFileSize(record.sizeBytes),
    uploadedBy: record.uploadedBy,
    mimeType: record.mimeType,
    appointmentId: record.appointmentId,
    appointmentReference: record.appointment?.reference ?? null,
    appointmentDate: record.appointment ? formatRecordDate(record.appointment.startsAt) : null,
  };
}

export function absoluteStoragePath(storagePath: string) {
  return path.resolve(UPLOAD_ROOT, storagePath);
}

export async function listRecordsForPatient(userId: string) {
  const rows = await prisma.patientMedicalRecord.findMany({
    where: { userId },
    include: { appointment: { select: { id: true, reference: true, startsAt: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toPublic);
}

export async function createRecordForPatient(input: {
  userId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string;
  category?: string;
  appointmentId?: string | null;
  recordRequestId?: string | null;
}) {
  const record = await prisma.patientMedicalRecord.create({
    data: {
      userId: input.userId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath,
      uploadedBy: input.uploadedBy,
      category: input.category?.trim() || inferCategory(input.fileName, input.mimeType),
      appointmentId: input.appointmentId || null,
      recordRequestId: input.recordRequestId || null,
    },
    include: { appointment: { select: { id: true, reference: true, startsAt: true } } },
  });
  await logReportUploaded(record);
  const recordWithUser = await prisma.patientMedicalRecord.findUniqueOrThrow({
    where: { id: record.id },
    include: { user: true, appointment: { select: { reference: true } } },
  });
  await logReportUploadedForDoctors(recordWithUser, {
    appointmentReference: recordWithUser.appointment?.reference,
  });
  return toPublic(record);
}

export async function getRecordFileForPatient(recordId: string, userId: string) {
  const record = await prisma.patientMedicalRecord.findUnique({ where: { id: recordId } });
  if (!record || record.userId !== userId) {
    throw new AppError(404, "Record not found");
  }

  const absolutePath = absoluteStoragePath(record.storagePath);
  if (!fs.existsSync(absolutePath)) {
    throw new AppError(404, "File is missing from storage");
  }

  return { record, absolutePath };
}

export async function getRecordFileForDoctor(input: {
  doctorUserId: string;
  patientId: string;
  recordId: string;
}) {
  const linked = await prisma.appointment.findFirst({
    where: {
      doctorUserId: input.doctorUserId,
      patientId: input.patientId,
    },
  });
  if (!linked) {
    throw new AppError(404, "Patient not found in your list");
  }

  const record = await prisma.patientMedicalRecord.findUnique({ where: { id: input.recordId } });
  if (!record || record.userId !== input.patientId) {
    throw new AppError(404, "Record not found");
  }

  const absolutePath = absoluteStoragePath(record.storagePath);
  if (!fs.existsSync(absolutePath)) {
    throw new AppError(404, "File is missing from storage");
  }

  return { record, absolutePath };
}
