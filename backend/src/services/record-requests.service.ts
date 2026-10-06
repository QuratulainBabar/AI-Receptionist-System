import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { normalizePhone } from "../utils/phone.js";
import { createRawToken, hashToken } from "./auth.helpers.js";
import {
  createRecordForPatient,
  formatRecordDate,
  listRecordsForPatient,
} from "./records.service.js";
import { sendClinicSms } from "./synthflow.client.js";

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

  const phone = normalizePhone(appointment.patient.medicalHistory?.phone || "");
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
  try {
    await sendClinicSms({
      toPhone: phone,
      patientName: appointment.patient.fullName,
      doctorName: doctor.fullName,
      appointmentReference: appointment.reference,
      uploadUrl: link,
    });
    smsSent = true;
  } catch (error) {
    smsError = error instanceof Error ? error.message : "SMS could not be sent";
  }

  const updated = await prisma.recordRequest.update({
    where: { id: request.id },
    data: { smsSent, smsError },
  });

  const full = await loadRequestById(updated.id);
  const publicRequest = toPublic(full, rawToken);

  return {
    ...publicRequest,
    message: smsSent
      ? `Upload link SMS sent to ${phone} from ${env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053"}.`
      : `Upload link created, but SMS failed: ${smsError}. Link: ${link}`,
  };
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
  }

  return {
    request: toPublic(row),
    patientId: row.patientId,
    appointmentId: row.appointmentId,
    recordRequestId: row.id,
    categories: [...RECORD_UPLOAD_CATEGORIES],
  };
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
  if (category && !RECORD_UPLOAD_CATEGORIES.includes(category as RecordUploadCategory)) {
    throw new AppError(400, "Choose a valid document category");
  }

  const patient = await prisma.user.findUnique({ where: { id: resolved.patientId } });
  if (!patient || patient.role !== "PATIENT" || !patient.isActive) {
    throw new AppError(403, "Patient account is not available for uploads");
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

  return record;
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
  <style>
    :root { color-scheme: light; --brand: #3047A0; --bg: #F3F5FB; --card: #fff; --line: #D5DCF0; --muted: #4E5E8C; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: linear-gradient(180deg, #F7F8FC, var(--bg)); color: #1a2448; }
    main { max-width: 480px; margin: 0 auto; padding: 28px 18px 48px; }
    .brand { font-size: 13px; font-weight: 700; letter-spacing: 0.04em; color: var(--brand); text-transform: uppercase; }
    h1 { margin: 10px 0 6px; font-size: 1.55rem; line-height: 1.2; }
    p { margin: 0 0 12px; color: var(--muted); font-size: 0.95rem; line-height: 1.45; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; margin-top: 18px; box-shadow: 0 12px 32px -18px #3047A038; }
    label { display: block; font-size: 0.82rem; font-weight: 600; margin: 0 0 6px; }
    select, input[type="file"] { width: 100%; margin-bottom: 14px; }
    select { appearance: none; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; background: #F3F5FB; font: inherit; }
    button { width: 100%; border: 0; border-radius: 999px; padding: 13px 16px; background: var(--brand); color: #fff; font: inherit; font-weight: 650; cursor: pointer; }
    button:disabled { opacity: 0.6; cursor: wait; }
    .meta { font-size: 0.8rem; color: var(--muted); }
    .error { color: #b42318; background: #fee4e2; border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; font-size: 0.9rem; }
    .ok { color: #067647; background: #dcfae6; border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; font-size: 0.9rem; display: none; }
    .hint { font-size: 0.78rem; color: var(--muted); margin-top: 10px; }
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
        <select id="category" name="category" required>
          <option value="">Select a type</option>
          ${categoryOptions}
        </select>
        <label for="file">File (PDF, JPG or PNG · max 10 MB)</label>
        <input id="file" name="file" type="file" accept=".pdf,image/jpeg,image/png,application/pdf" required />
        <button type="submit" id="submit">Upload document</button>
      </form>
      <p class="hint">You can upload multiple documents. Each file is saved against this appointment.</p>
    </div>
  </main>
  <script>
    const form = document.getElementById("upload-form");
    const errorEl = document.getElementById("error");
    const okEl = document.getElementById("ok");
    const submit = document.getElementById("submit");
    const token = ${JSON.stringify(input.token)};
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorEl.style.display = "none";
      okEl.style.display = "none";
      const file = document.getElementById("file").files[0];
      const category = document.getElementById("category").value;
      if (!file) return;
      const body = new FormData();
      body.append("file", file);
      body.append("category", category);
      submit.disabled = true;
      submit.textContent = "Uploading…";
      try {
        const response = await fetch("/api/record-uploads/" + encodeURIComponent(token), {
          method: "POST",
          body,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Upload failed");
        okEl.textContent = (data.record?.name || file.name) + " uploaded. You can add another file if needed.";
        okEl.style.display = "block";
        form.reset();
      } catch (err) {
        errorEl.textContent = err instanceof Error ? err.message : "Upload failed";
        errorEl.style.display = "block";
      } finally {
        submit.disabled = false;
        submit.textContent = "Upload document";
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
  <style>
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #F3F5FB; color: #1a2448; }
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
