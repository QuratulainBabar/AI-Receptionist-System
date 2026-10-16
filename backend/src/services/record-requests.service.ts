import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { normalizePhone, phonesMatch } from "../utils/phone.js";
import { createRawToken, hashToken } from "./auth.helpers.js";
import { findPatientIdsByPhone } from "./patient-phone.service.js";
import {
  absoluteStoragePath,
  createRecordForPatient,
  formatRecordDate,
  getUploadRoot,
  listRecordsForPatient,
} from "./records.service.js";
import { sendClinicSms } from "./synthflow.client.js";
import { isDoctorSmsEnabled } from "./doctor-sms-preferences.service.js";

export const RECORD_UPLOAD_CATEGORIES = [
  "Medical history",
  "Report",
  "Prescription",
  "Test result",
  "Previous record",
  "Other",
] as const;

export type RecordUploadCategory = (typeof RECORD_UPLOAD_CATEGORIES)[number];

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PublicRecordRequest = {
  id: string;
  appointmentId: string;
  appointmentReference: string;
  patientName: string;
  doctorName: string;
  phone: string;
  status: string;
  smsSent: boolean;
  smsError: string;
  expiresAt: string;
  createdAt: string;
  uploadUrl: string;
  recordsCount: number;
};

function uploadUrlForToken(rawToken: string) {
  const root = env.PUBLIC_API_URL.replace(/\/$/, "");
  return `${root}/upload/${rawToken}`;
}

function toPublicStatus(status: string, expiresAt: Date, recordsCount: number) {
  if (recordsCount > 0) return "uploaded";
  if (expiresAt.getTime() < Date.now()) return "expired";
  return status;
}

function toPublic(row: {
  id: string;
  appointmentId: string;
  phone: string;
  status: string;
  smsSent: boolean;
  smsError: string;
  expiresAt: Date;
  createdAt: Date;
  appointment: { reference: string; patient: { fullName: string }; doctorUser: { fullName: string } };
  _count?: { records: number };
  records?: unknown[];
}, rawToken?: string): PublicRecordRequest {
  const recordsCount = row._count?.records ?? row.records?.length ?? 0;
  return {
    id: row.id,
    appointmentId: row.appointmentId,
    appointmentReference: row.appointment.reference,
    patientName: row.appointment.patient.fullName,
    doctorName: row.appointment.doctorUser.fullName,
    phone: row.phone,
    status: toPublicStatus(row.status, row.expiresAt, recordsCount),
    smsSent: row.smsSent,
    smsError: row.smsError,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    uploadUrl: rawToken ? uploadUrlForToken(rawToken) : "",
    recordsCount,
  };
}

async function loadRequestById(id: string) {
  return prisma.recordRequest.findUniqueOrThrow({
    where: { id },
    include: {
      appointment: {
        include: {
          patient: { select: { fullName: true } },
          doctorUser: { select: { fullName: true } },
        },
      },
      _count: { select: { records: true } },
    },
  });
}

export async function requestRecordsForAppointment(input: {
  doctorUserId: string;
  appointmentId: string;
}) {
  const doctor = await prisma.user.findUnique({ where: { id: input.doctorUserId } });
  if (!doctor || doctor.role !== "DOCTOR" || !doctor.isActive) {
    throw new AppError(403, "Only active doctors can request medical records");
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    include: {
      patient: { include: { medicalHistory: true } },
      doctorUser: true,
      recordRequest: true,
    },
  });

  if (!appointment || appointment.doctorUserId !== input.doctorUserId) {
    throw new AppError(404, "Appointment not found");
  }
  if (appointment.status === "CANCELLED") {
    throw new AppError(400, "Cannot request records for a cancelled appointment");
  }

  const phone = normalizePhone(
    appointment.bookingPhone ||
      appointment.patient.medicalHistory?.phone ||
      appointment.patient.phone ||
      "",
  );
  if (!phone) {
    throw new AppError(
      400,
      "This patient has no registered phone number. Ask them to add a phone in medical history first.",
    );
  }

  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);

  const request = await prisma.recordRequest.upsert({
    where: { appointmentId: appointment.id },
    create: {
      tokenHash,
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorUserId: input.doctorUserId,
      phone,
      status: "sent",
      smsSent: false,
      smsError: "",
      expiresAt,
    },
    update: {
      tokenHash,
      phone,
      status: "sent",
      smsSent: false,
      smsError: "",
      expiresAt,
      openedAt: null,
    },
  });

  const link = uploadUrlForToken(rawToken);

  let smsSent = false;
  let smsError = "";
  let dialWarning = "";
  const recordSmsOn = await isDoctorSmsEnabled(input.doctorUserId, "recordUploads");
  if (!recordSmsOn) {
    smsError = "Medical record upload texts are turned off in Settings.";
  } else {
    try {
      const dialed = await sendClinicSms({
        toPhone: phone,
        patientName: appointment.patient.fullName,
        doctorName: doctor.fullName,
        appointmentReference: appointment.reference,
        uploadUrl: link,
      });
      if (dialed.status === "calling") {
        smsSent = true;
        console.log(
          `[records] Outbound call started call_id=${dialed.callId} → ${dialed.toPhone} for ${appointment.reference}`,
        );
      } else {
        smsError = dialed.warning || `Call status: ${dialed.status}`;
        dialWarning = smsError;
        console.warn(
          `[records] Outbound call ${dialed.callId} → ${dialed.toPhone} status=${dialed.status}`,
        );
      }
    } catch (error) {
      smsError = error instanceof Error ? error.message : "SMS could not be sent";
      console.warn(`[records] Outbound call failed for ${appointment.reference}:`, smsError);
    }
  }

  const updated = await prisma.recordRequest.update({
    where: { id: request.id },
    data: { smsSent, smsError },
  });

  const full = await loadRequestById(updated.id);
  const publicRequest = toPublic(full, rawToken);
  const fromNumber = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";

  return {
    ...publicRequest,
    message: smsSent
      ? `Calling ${phone} from ${fromNumber}. The agent will ask for the mobile number, confirm it, then text the upload link.`
      : smsError.includes("turned off in Settings")
        ? `Upload link created. Record-upload texts are turned off in Settings. Link: ${link}`
        : dialWarning || smsError
          ? `${dialWarning || smsError}`
          : `Call did not connect. Share this upload link manually: ${link}`,
  };
}

/**
 * After voice booking OTP confirmation: mint a secure upload link for the
 * caller's confirmed appointment. Does not send SMS — the webhook handler does.
 */
export async function createUploadLinkForVoiceBooking(input: {
  phone?: string;
  appointmentReference?: string;
}) {
  const phone = normalizePhone(input.phone || "");
  const reference = (input.appointmentReference || "").trim().replace(/\s+/g, "");
  const referenceKey = reference.match(/APT-?(\d+)/i)?.[1]
    ? `APT-${reference.match(/APT-?(\d+)/i)![1]}`
    : reference;

  if (!phone && !referenceKey) {
    throw new AppError(400, "A mobile number or appointment reference is required for the upload link.");
  }

  const patientIds = phone ? await findPatientIdsByPhone(phone) : [];

  const recentConfirmed = await prisma.appointment.findMany({
    where: {
      status: "CONFIRMED",
      ...(referenceKey
        ? { reference: { equals: referenceKey, mode: "insensitive" } }
        : patientIds.length
          ? {
              OR: [{ bookingPhone: phone }, { patientId: { in: patientIds } }],
            }
          : phone
            ? undefined
            : { id: "__none__" }),
    },
    include: {
      patient: { include: { medicalHistory: true } },
      doctorUser: true,
      recordRequest: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  let appointment =
    recentConfirmed.find((row) => {
      if (referenceKey) return row.reference.toLowerCase() === referenceKey.toLowerCase();
      const booking = row.bookingPhone || "";
      const history = row.patient.medicalHistory?.phone || "";
      const account = row.patient.phone || "";
      return (
        phonesMatch(booking, phone) ||
        phonesMatch(history, phone) ||
        phonesMatch(account, phone) ||
        (patientIds.length > 0 && patientIds.includes(row.patientId))
      );
    }) ||
    (!referenceKey && phone
      ? recentConfirmed.find((row) => phonesMatch(row.bookingPhone || "", phone))
      : undefined);

  // Fallback: scan recent confirmed visits when phone formatting differs in DB.
  if (!appointment && phone) {
    const broader = await prisma.appointment.findMany({
      where: { status: "CONFIRMED" },
      include: {
        patient: { include: { medicalHistory: true } },
        doctorUser: true,
        recordRequest: true,
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    });
    appointment = broader.find((row) => {
      const booking = row.bookingPhone || "";
      const history = row.patient.medicalHistory?.phone || "";
      const account = row.patient.phone || "";
      return (
        phonesMatch(booking, phone) ||
        phonesMatch(history, phone) ||
        phonesMatch(account, phone)
      );
    });
  }

  if (!appointment) {
    throw new AppError(404, "I could not find a confirmed appointment for this phone number.");
  }

  const smsPhone = normalizePhone(
    appointment.bookingPhone ||
      appointment.patient.medicalHistory?.phone ||
      appointment.patient.phone ||
      phone,
  );
  if (!smsPhone) {
    throw new AppError(400, "This appointment has no phone number for the upload link text.");
  }

  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);

  const request = await prisma.recordRequest.upsert({
    where: { appointmentId: appointment.id },
    create: {
      tokenHash,
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorUserId: appointment.doctorUserId,
      phone: smsPhone,
      status: "sent",
      smsSent: false,
      smsError: "",
      expiresAt,
    },
    update: {
      tokenHash,
      phone: smsPhone,
      status: "sent",
      smsSent: false,
      smsError: "",
      expiresAt,
      openedAt: null,
    },
  });

  const uploadUrl = uploadUrlForToken(rawToken);
  console.log(
    `[records] Voice booking upload link generated request=${request.id} appointment=${appointment.reference} phone=${smsPhone} url=${uploadUrl}`,
  );

  return {
    requestId: request.id,
    appointmentId: appointment.id,
    appointmentReference: appointment.reference,
    doctorName: appointment.doctorUser.fullName,
    patientName: appointment.patient.fullName,
    phone: smsPhone,
    uploadUrl,
    expiresAt,
  };
}

export async function markRecordRequestSmsResult(input: {
  requestId: string;
  smsSent: boolean;
  smsError?: string;
}) {
  return prisma.recordRequest.update({
    where: { id: input.requestId },
    data: {
      smsSent: input.smsSent,
      smsError: input.smsError || "",
    },
  });
}

export async function getRecordRequestSummaryForAppointments(appointmentIds: string[]) {
  if (!appointmentIds.length) return new Map<string, PublicRecordRequest>();

  const rows = await prisma.recordRequest.findMany({
    where: { appointmentId: { in: appointmentIds } },
    include: {
      appointment: {
        include: {
          patient: { select: { fullName: true } },
          doctorUser: { select: { fullName: true } },
        },
      },
      _count: { select: { records: true } },
    },
  });

  return new Map(rows.map((row) => [row.appointmentId, toPublic(row)]));
}

export async function resolveRecordRequestByToken(rawToken: string) {
  const token = rawToken.trim();
  if (!token || token.length < 20) {
    throw new AppError(404, "This upload link is invalid");
  }

  const row = await prisma.recordRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      appointment: {
        include: {
          patient: { select: { fullName: true } },
          doctorUser: { select: { fullName: true } },
        },
      },
      _count: { select: { records: true } },
    },
  });

  if (!row) {
    throw new AppError(404, "This upload link is invalid or has been replaced");
  }

  if (row.expiresAt.getTime() < Date.now()) {
    throw new AppError(410, "This upload link has expired. Ask your doctor to send a new one.");
  }

  if (!row.openedAt) {
    await prisma.recordRequest.update({
      where: { id: row.id },
      data: { openedAt: new Date(), status: row.status === "sent" ? "opened" : row.status },
    });
    console.log(
      `[records] Upload link opened appointment=${row.appointment.reference} request=${row.id} phone=${row.phone}`,
    );
  }

  return {
    request: toPublic(row),
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    recordRequestId: row.id,
    categories: [...RECORD_UPLOAD_CATEGORIES],
  };
}

const MAX_DOC_FILES = 12;
const MAX_IMAGE_FILES = 12;

function isImageMime(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isNotesCategory(category: string) {
  return category.trim().toLowerCase() === "patient notes";
}

export async function uploadRecordViaToken(input: {
  rawToken: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  category?: string;
}) {
  const resolved = await resolveRecordRequestByToken(input.rawToken);
  const category = (input.category || "").trim();
  if (
    category &&
    !isNotesCategory(category) &&
    !RECORD_UPLOAD_CATEGORIES.includes(category as RecordUploadCategory)
  ) {
    throw new AppError(400, "Choose a valid document category");
  }

  const patient = await prisma.user.findUnique({ where: { id: resolved.patientId } });
  if (!patient || patient.role !== "PATIENT" || !patient.isActive) {
    throw new AppError(403, "Patient account is not available for uploads");
  }

  const existing = await prisma.patientMedicalRecord.findMany({
    where: { recordRequestId: resolved.recordRequestId },
    select: { mimeType: true, category: true },
  });
  const existingDocs = existing.filter(
    (row) => !isImageMime(row.mimeType) && !isNotesCategory(row.category),
  ).length;
  const existingImages = existing.filter((row) => isImageMime(row.mimeType)).length;

  if (isNotesCategory(category || "")) {
    // Notes replace prior notes for this request.
  } else if (isImageMime(input.mimeType)) {
    if (existingImages >= MAX_IMAGE_FILES) {
      throw new AppError(400, `You can upload at most ${MAX_IMAGE_FILES} images for this request.`);
    }
  } else if (existingDocs >= MAX_DOC_FILES) {
    throw new AppError(400, `You can upload at most ${MAX_DOC_FILES} files for this request.`);
  }

  const record = await createRecordForPatient({
    userId: resolved.patientId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    storagePath: input.storagePath,
    uploadedBy: patient.fullName,
    category: category || undefined,
    appointmentId: resolved.appointmentId,
    recordRequestId: resolved.recordRequestId,
  });

  await prisma.recordRequest.update({
    where: { id: resolved.recordRequestId },
    data: { status: "uploaded" },
  });

  console.log(
    `[records] File uploaded appointment=${resolved.appointmentId} request=${resolved.recordRequestId} file=${input.fileName} mime=${input.mimeType} bytes=${input.sizeBytes}`,
  );

  return record;
}

export async function savePatientNotesViaToken(input: { rawToken: string; notes: string }) {
  const notes = input.notes.trim();
  if (!notes) return null;
  if (notes.length > 4000) {
    throw new AppError(400, "Notes must be 4000 characters or fewer.");
  }

  const resolved = await resolveRecordRequestByToken(input.rawToken);
  const patient = await prisma.user.findUnique({ where: { id: resolved.patientId } });
  if (!patient || patient.role !== "PATIENT" || !patient.isActive) {
    throw new AppError(403, "Patient account is not available for uploads");
  }

  const prior = await prisma.patientMedicalRecord.findMany({
    where: { recordRequestId: resolved.recordRequestId, category: "Patient notes" },
  });
  for (const row of prior) {
    const diskPath = absoluteStoragePath(row.storagePath);
    if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    await prisma.patientMedicalRecord.delete({ where: { id: row.id } }).catch(() => undefined);
  }

  const root = getUploadRoot();
  const storageName = `patient-notes-${Date.now()}.txt`;
  fs.writeFileSync(path.join(root, storageName), notes, "utf8");

  return uploadRecordViaToken({
    rawToken: input.rawToken,
    fileName: "Patient notes.txt",
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength(notes, "utf8"),
    storagePath: storageName,
    category: "Patient notes",
  });
}

export async function uploadBatchViaToken(input: {
  rawToken: string;
  files: Array<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
  }>;
  images: Array<{
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
  }>;
  notes?: string;
  category?: string;
}) {
  const docs = input.files.slice(0, MAX_DOC_FILES);
  const images = input.images.slice(0, MAX_IMAGE_FILES);
  if (!docs.length && !images.length && !(input.notes || "").trim()) {
    throw new AppError(400, "Add at least one file, image, or note before submitting.");
  }

  const uploaded = [];
  for (const file of docs) {
    if (isImageMime(file.mimeType)) {
      throw new AppError(400, "Put images in the images section (max 3).");
    }
    uploaded.push(
      await uploadRecordViaToken({
        rawToken: input.rawToken,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storagePath: file.storagePath,
        category: input.category,
      }),
    );
  }
  for (const image of images) {
    if (!isImageMime(image.mimeType)) {
      throw new AppError(400, "Images must be JPG or PNG.");
    }
    uploaded.push(
      await uploadRecordViaToken({
        rawToken: input.rawToken,
        fileName: image.fileName,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
        storagePath: image.storagePath,
        category: input.category || "Imaging",
      }),
    );
  }

  const notesRecord = await savePatientNotesViaToken({
    rawToken: input.rawToken,
    notes: input.notes || "",
  });
  if (notesRecord) uploaded.push(notesRecord);

  return uploaded;
}

export async function listGroupedRecordsForDoctor(doctorUserId: string, patientId: string) {
  const linked = await prisma.appointment.findFirst({
    where: { doctorUserId, patientId },
  });
  if (!linked) {
    throw new AppError(404, "Patient not found in your list");
  }

  const records = await listRecordsForPatient(patientId);
  const groups = new Map<
    string,
    {
      appointmentId: string | null;
      appointmentReference: string | null;
      appointmentDate: string | null;
      uploadsByDate: Map<string, typeof records>;
    }
  >();

  for (const record of records) {
    const key = record.appointmentId || "unassigned";
    let group = groups.get(key);
    if (!group) {
      group = {
        appointmentId: record.appointmentId,
        appointmentReference: record.appointmentReference,
        appointmentDate: record.appointmentDate,
        uploadsByDate: new Map(),
      };
      groups.set(key, group);
    }
    const dateKey = record.date;
    const bucket = group.uploadsByDate.get(dateKey) || [];
    bucket.push(record);
    group.uploadsByDate.set(dateKey, bucket);
  }

  return [...groups.values()].map((group) => ({
    appointmentId: group.appointmentId,
    appointmentReference: group.appointmentReference,
    appointmentDate: group.appointmentDate,
    label: group.appointmentReference
      ? `${group.appointmentReference}${group.appointmentDate ? ` · ${group.appointmentDate}` : ""}`
      : "Not linked to an appointment",
    uploadDates: [...group.uploadsByDate.entries()].map(([date, items]) => ({
      date,
      records: items,
    })),
  }));
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderUploadPageHtml(input: {
  token: string;
  patientName: string;
  doctorName: string;
  appointmentReference: string;
  expiresAt: string;
  categories: string[];
  error?: string;
}) {
  const expiresLabel = formatRecordDate(new Date(input.expiresAt));
  const categoryOptions = input.categories
    .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Upload medical records — Qubetech</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root { color-scheme: light; --brand: #3047A0; --bg: #F3F5FB; --card: #fff; --line: #D5DCF0; --muted: #4E5E8C; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif; background: linear-gradient(180deg, #F7F8FC, var(--bg)); color: #1a2448; }
    main { max-width: 520px; margin: 0 auto; padding: 28px 18px 48px; }
    .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; color: var(--brand); text-transform: uppercase; }
    h1 { margin: 10px 0 6px; font-size: 1.55rem; line-height: 1.2; }
    p { margin: 0 0 12px; color: var(--muted); font-size: 0.95rem; line-height: 1.45; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; margin-top: 18px; box-shadow: 0 12px 32px -18px #3047A038; }
    label { display: block; font-size: 0.82rem; font-weight: 600; margin: 14px 0 6px; }
    label:first-of-type { margin-top: 0; }
    select, input[type="file"], textarea { width: 100%; margin-bottom: 4px; }
    select, textarea { appearance: none; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; background: #F3F5FB; font: inherit; }
    textarea { min-height: 96px; resize: vertical; }
    button { width: 100%; border: 0; border-radius: 999px; padding: 13px 16px; margin-top: 16px; background: var(--brand); color: #fff; font: inherit; font-weight: 650; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: wait; }
    .meta { font-size: 0.8rem; color: var(--muted); }
    .error { color: #b42318; background: #fee4e2; border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; font-size: 0.9rem; }
    .ok { color: #067647; background: #dcfae6; border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; font-size: 0.9rem; display: none; }
    .hint { font-size: 0.78rem; color: var(--muted); margin-top: 6px; }
  </style>
</head>
<body>
  <main>
    <div class="brand">Qubetech clinic</div>
    <h1>Upload your medical records</h1>
    <p>Dr. ${escapeHtml(input.doctorName.replace(/^Dr\.?\s*/i, ""))} asked for documents for appointment <strong>${escapeHtml(input.appointmentReference)}</strong>.</p>
    <p class="meta">Patient: ${escapeHtml(input.patientName)} · Link expires ${escapeHtml(expiresLabel)}</p>
    <div class="card">
      <div id="error" class="error" ${input.error ? "" : 'style="display:none"'}>${escapeHtml(input.error || "")}</div>
      <div id="ok" class="ok"></div>
      <form id="upload-form">
        <label for="category">Document type</label>
        <select id="category" name="category">
          <option value="">Select a type (optional for images/notes)</option>
          ${categoryOptions}
        </select>
        <label for="files">Files — PDF (max 12 · 10 MB each)</label>
        <input id="files" name="files" type="file" accept=".pdf,application/pdf" multiple />
        <p class="hint" id="files-hint">0 of 12 files selected</p>
        <label for="images">Images — gallery JPG or PNG (max 12 · 10 MB each)</label>
        <input id="images" name="images" type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" multiple />
        <p class="hint" id="images-hint">0 of 12 images selected</p>
        <label for="camera">Camera — take a photo</label>
        <input id="camera" name="camera" type="file" accept="image/*" capture="environment" />
        <p class="hint" id="camera-hint">Use your phone camera to capture a document or photo</p>
        <label for="notes">Notes for the doctor (optional)</label>
        <textarea id="notes" name="notes" maxlength="4000" placeholder="Anything else your doctor should know…"></textarea>
        <button type="submit" id="submit">Submit records</button>
      </form>
      <p class="hint">Attach files, gallery images, or camera photos — up to 12 each — plus optional notes. Everything is saved on this appointment for your doctor.</p>
    </div>
  </main>
  <script>
    const form = document.getElementById("upload-form");
    const errorEl = document.getElementById("error");
    const okEl = document.getElementById("ok");
    const submit = document.getElementById("submit");
    const filesInput = document.getElementById("files");
    const imagesInput = document.getElementById("images");
    const cameraInput = document.getElementById("camera");
    const filesHint = document.getElementById("files-hint");
    const imagesHint = document.getElementById("images-hint");
    const cameraHint = document.getElementById("camera-hint");
    const token = ${JSON.stringify(input.token)};
    const maxDocs = 12;
    const maxImages = 12;

    function syncHints() {
      const fileCount = Math.min(filesInput.files.length, maxDocs);
      const galleryCount = imagesInput.files ? imagesInput.files.length : 0;
      const cameraCount = cameraInput.files && cameraInput.files.length ? 1 : 0;
      const imageCount = Math.min(galleryCount + cameraCount, maxImages);
      filesHint.textContent = fileCount + " of " + maxDocs + " files selected";
      imagesHint.textContent = imageCount + " of " + maxImages + " images selected (gallery + camera)";
      cameraHint.textContent = cameraCount
        ? "1 camera photo ready to upload"
        : "Use your phone camera to capture a document or photo";
      if (filesInput.files.length > maxDocs) {
        errorEl.textContent = "You can attach at most " + maxDocs + " files.";
        errorEl.style.display = "block";
      } else if (galleryCount + cameraCount > maxImages) {
        errorEl.textContent = "You can attach at most " + maxImages + " images.";
        errorEl.style.display = "block";
      } else {
        errorEl.style.display = "none";
      }
    }
    filesInput.addEventListener("change", syncHints);
    imagesInput.addEventListener("change", syncHints);
    cameraInput.addEventListener("change", syncHints);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorEl.style.display = "none";
      okEl.style.display = "none";
      const fileList = Array.from(filesInput.files || []).slice(0, maxDocs);
      const imageList = Array.from(imagesInput.files || []);
      if (cameraInput.files && cameraInput.files[0]) imageList.push(cameraInput.files[0]);
      const finalImages = imageList.slice(0, maxImages);
      const notes = document.getElementById("notes").value.trim();
      const category = document.getElementById("category").value;
      if (!fileList.length && !finalImages.length && !notes) {
        errorEl.textContent = "Add at least one file, image, camera photo, or note.";
        errorEl.style.display = "block";
        return;
      }
      if ((filesInput.files || []).length > maxDocs || imageList.length > maxImages) {
        errorEl.textContent = "Maximum is " + maxDocs + " files and " + maxImages + " images.";
        errorEl.style.display = "block";
        return;
      }
      const body = new FormData();
      fileList.forEach((file) => body.append("files", file));
      finalImages.forEach((file) => body.append("images", file));
      if (category) body.append("category", category);
      if (notes) body.append("notes", notes);
      submit.disabled = true;
      submit.textContent = "Submitting…";
      try {
        const response = await fetch("/api/record-uploads/" + encodeURIComponent(token), {
          method: "POST",
          body,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Upload failed");
        const count = Array.isArray(data.records) ? data.records.length : 0;
        okEl.textContent = count
          ? count + " item(s) sent to your doctor. You can close this page."
          : "Submitted. Your doctor can now see your upload.";
        okEl.style.display = "block";
        form.reset();
        syncHints();
      } catch (err) {
        errorEl.textContent = err instanceof Error ? err.message : "Upload failed";
        errorEl.style.display = "block";
      } finally {
        submit.disabled = false;
        submit.textContent = "Submit records";
      }
    });
  </script>
</body>
</html>`;
}

export function renderUploadErrorPage(message: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Upload link unavailable</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    body { margin: 0; font-family: "Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif; background: #F3F5FB; color: #1a2448; }
    main { max-width: 420px; margin: 48px auto; padding: 0 18px; }
    h1 { font-size: 1.4rem; }
    p { color: #4E5E8C; line-height: 1.45; }
  </style>
</head>
<body>
  <main>
    <h1>Link unavailable</h1>
    <p>${escapeHtml(message)}</p>
  </main>
</body>
</html>`;
}
