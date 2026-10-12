import crypto from "node:crypto";
import type {
  Appointment,
  PatientMedicalHistory,
  PatientMedicalRecord,
  User,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { clinicTimeZone, formatClinicDate, formatClinicTime } from "../utils/clinic-time.js";
import { digitsOnly, normalizePhone } from "../utils/phone.js";
import { formatFileSize, formatRecordDate } from "./records.service.js";
import {
  syncDoctorAppointmentInvoices,
  toPublicAppointmentInvoice,
  type PublicAppointmentInvoice,
} from "./appointment-invoices.service.js";
import { excludeUnconfirmedVoiceHold } from "./appointments.service.js";
import { buildPatientTimeline, type PatientTimelineEvent } from "./patient-chart.service.js";
import { generateUniqueReference, hashPassword, toPrismaRole } from "./auth.helpers.js";
import { findPatientByPhone } from "./patient-phone.service.js";
import { logPatientActivity } from "./activity.service.js";

export type PublicDoctorPatient = {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  reference: string;
  lastVisit: string;
  condition: string;
  phone: string;
  email: string;
  isActive: boolean;
};

export type PublicDoctorPatientFile = {
  patient: PublicDoctorPatient;
  appointments: Array<{
    id: string;
    reference: string;
    doctorId: string;
    doctorName: string;
    speciality: string;
    patientId: string;
    patientName: string;
    date: string;
    time: string;
    duration: string;
    mode: "In clinic" | "Video call";
    reason: string;
    status: "confirmed" | "pending" | "completed" | "cancelled";
    clinic: string;
    fee: string;
    startsAt: string;
    followUpOfId: string | null;
    followUpOfReference: string | null;
    isFollowUp: boolean;
    invoice: PublicAppointmentInvoice | null;
    recordRequest: {
      status: string;
      smsSent: boolean;
      smsError: string;
      expiresAt: string;
      createdAt: string;
      recordsCount: number;
    } | null;
  }>;
  history: {
    fullName: string;
    age: number | null;
    bloodGroup: string;
    phone: string;
    symptoms: string;
    conditions: string[];
    allergies: string[];
    medications: string[];
    surgeries: string[];
    familyHistory: string[];
    updatedAt: string | null;
  };
  records: Array<{
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
  }>;
  recordGroups: Array<{
    appointmentId: string | null;
    appointmentReference: string | null;
    appointmentDate: string | null;
    label: string;
    uploadDates: Array<{
      date: string;
      records: Array<{
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
      }>;
    }>;
  }>;
  timeline: PatientTimelineEvent[];
};

type PatientWithRelations = User & {
  medicalHistory: PatientMedicalHistory | null;
  patientAppointments: Appointment[];
};

function formatLastVisitLabel(date: Date) {
  return date.toLocaleDateString("en-GB", {
    timeZone: clinicTimeZone(),
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAppointmentDate(date: Date) {
  return formatClinicDate(date);
}

function formatAppointmentTime(date: Date) {
  return formatClinicTime(date);
}

function shortCondition(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withoutSince = trimmed.replace(/\s*\(.*?\)\s*$/, "").trim();
  return withoutSince || trimmed;
}

function resolveCondition(
  history: PatientMedicalHistory | null,
  appointments: Appointment[],
): string {
  const fromHistory = history?.conditions?.[0];
  if (fromHistory) return shortCondition(fromHistory);

  const withReason = [...appointments]
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
    .find((appointment) => appointment.reason.trim());
  if (withReason?.reason.trim()) return withReason.reason.trim();

  return "General consultation";
}

function resolveLastVisit(appointments: Appointment[], now = new Date()): string {
  const past = appointments
    .filter((appointment) => appointment.status !== "CANCELLED")
    .filter(
      (appointment) =>
        appointment.status === "COMPLETED" || appointment.startsAt.getTime() < now.getTime(),
    )
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());

  if (!past.length) return "First visit";
  return formatLastVisitLabel(past[0].startsAt);
}

function toPublicPatient(row: PatientWithRelations): PublicDoctorPatient {
  const email = row.email?.trim() || "";
  const isPlaceholderEmail = email.toLowerCase().includes("@patients.receptionist.local");
  return {
    id: row.id,
    name: row.fullName,
    age: row.medicalHistory?.age ?? null,
    gender: row.medicalHistory?.gender?.trim() || "—",
    reference: row.reference,
    lastVisit: resolveLastVisit(row.patientAppointments),
    condition: resolveCondition(row.medicalHistory, row.patientAppointments),
    phone: row.medicalHistory?.phone || row.phone || "",
    email: isPlaceholderEmail ? "" : email,
    isActive: row.isActive,
  };
}

function toPublicAppointment(
  row: Appointment & {
    patient: User;
    doctorUser: User;
    followUpOf?: { id: string; reference: string } | null;
    recordRequest?: {
      status: string;
      smsSent: boolean;
      smsError: string;
      expiresAt: Date;
      createdAt: Date;
      _count?: { records: number };
    } | null;
    invoice?: Parameters<typeof toPublicAppointmentInvoice>[0];
  },
) {
  const status =
    row.status === "PENDING"
      ? "pending"
      : row.status === "COMPLETED"
        ? "completed"
        : row.status === "CANCELLED"
          ? "cancelled"
          : "confirmed";

  const recordsCount = row.recordRequest?._count?.records ?? 0;
  const expired = row.recordRequest ? row.recordRequest.expiresAt.getTime() < Date.now() : false;
  const requestStatus = !row.recordRequest
    ? null
    : recordsCount > 0
      ? "uploaded"
      : expired
        ? "expired"
        : row.recordRequest.status;

  return {
    id: row.id,
    reference: row.reference,
    doctorId: row.doctorUserId,
    doctorName: row.doctorUser.fullName,
    speciality: row.specialtyName,
    patientId: row.patientId,
    patientName: row.patient.fullName,
    date: formatAppointmentDate(row.startsAt),
    time: formatAppointmentTime(row.startsAt),
    duration: `${row.durationMinutes} min`,
    mode: (row.mode === "VIDEO_CALL" ? "Video call" : "In clinic") as "In clinic" | "Video call",
    reason: row.reason,
    status: status as "confirmed" | "pending" | "completed" | "cancelled",
    clinic: row.clinic,
    fee: row.fee,
    startsAt: row.startsAt.toISOString(),
    followUpOfId: row.followUpOfId ?? null,
    followUpOfReference: row.followUpOf?.reference ?? null,
    isFollowUp: Boolean(row.followUpOfId),
    invoice: toPublicAppointmentInvoice(row.invoice ?? null),
    recordRequest: row.recordRequest
      ? {
          status: requestStatus || row.recordRequest.status,
          smsSent: row.recordRequest.smsSent,
          smsError: row.recordRequest.smsError,
          expiresAt: row.recordRequest.expiresAt.toISOString(),
          createdAt: row.recordRequest.createdAt.toISOString(),
          recordsCount,
        }
      : null,
  };
}

function toPublicRecord(
  record: PatientMedicalRecord & {
    appointment?: { id: string; reference: string; startsAt: Date } | null;
  },
) {
  return {
    id: record.id,
    name: record.fileName,
    type: record.category,
    date: formatRecordDate(record.createdAt),
    size: formatFileSize(record.sizeBytes),
    uploadedBy: record.uploadedBy,
    mimeType: record.mimeType,
    appointmentId: record.appointmentId ?? null,
    appointmentReference: record.appointment?.reference ?? null,
    appointmentDate: record.appointment ? formatRecordDate(record.appointment.startsAt) : null,
  };
}

function groupRecords(
  records: ReturnType<typeof toPublicRecord>[],
): PublicDoctorPatientFile["recordGroups"] {
  const groups = new Map<string, PublicDoctorPatientFile["recordGroups"][number]>();

  for (const record of records) {
    const key = record.appointmentId || "unassigned";
    let group = groups.get(key);
    if (!group) {
      group = {
        appointmentId: record.appointmentId,
        appointmentReference: record.appointmentReference,
        appointmentDate: record.appointmentDate,
        label: record.appointmentReference
          ? `${record.appointmentReference}${record.appointmentDate ? ` · ${record.appointmentDate}` : ""}`
          : "Not linked to an appointment",
        uploadDates: [],
      };
      groups.set(key, group);
    }
    let dateBucket = group.uploadDates.find((row) => row.date === record.date);
    if (!dateBucket) {
      dateBucket = { date: record.date, records: [] };
      group.uploadDates.push(dateBucket);
    }
    dateBucket.records.push(record);
  }

  return [...groups.values()];
}

function matchesQuery(patient: PublicDoctorPatient, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return (
    patient.name.toLowerCase().includes(needle) ||
    patient.reference.toLowerCase().includes(needle) ||
    patient.condition.toLowerCase().includes(needle) ||
    patient.phone.toLowerCase().includes(needle) ||
    digitsOnly(patient.phone).includes(digitsOnly(needle))
  );
}

async function assertDoctor(doctorUserId: string) {
  const doctor = await prisma.user.findUnique({ where: { id: doctorUserId } });
  if (!doctor || doctor.role !== "DOCTOR" || !doctor.isActive) {
    throw new AppError(403, "Only active doctors can view patients");
  }
  return doctor;
}

async function linkedPatientIdsForDoctor(doctorUserId: string) {
  const [fromAppointments, fromNotes] = await Promise.all([
    prisma.appointment.findMany({
      where: { AND: [{ doctorUserId }, excludeUnconfirmedVoiceHold] },
      select: { patientId: true },
      distinct: ["patientId"],
    }),
    prisma.clinicalNote.findMany({
      where: { doctorUserId },
      select: { patientId: true },
      distinct: ["patientId"],
    }),
  ]);

  return [
    ...new Set([
      ...fromAppointments.map((row) => row.patientId),
      ...fromNotes.map((row) => row.patientId),
    ]),
  ];
}

async function ensureDoctorPatientLink(doctorUserId: string, patientId: string, detail: string) {
  const existing = await prisma.clinicalNote.findFirst({
    where: { doctorUserId, patientId },
    select: { id: true },
  });
  if (existing) return;

  await prisma.clinicalNote.create({
    data: {
      doctorUserId,
      patientId,
      body: detail,
    },
  });
}

function placeholderPatientEmail(phone: string) {
  const digits = digitsOnly(phone) || crypto.randomBytes(4).toString("hex");
  return `clinic.${digits}@patients.receptionist.local`;
}

async function uniquePatientEmail(base: string) {
  const normalized = base.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (!existing) return normalized;
  const [local, domain] = normalized.split("@");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${local}+${suffix}@${domain || "patients.receptionist.local"}`;
}

export async function createPatientForDoctor(
  doctorUserId: string,
  input: {
    fullName: string;
    phone: string;
    email?: string;
    age?: number | null;
    gender?: string;
    condition?: string;
  },
) {
  await assertDoctor(doctorUserId);

  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (fullName.length < 2) {
    throw new AppError(400, "Patient full name is required");
  }

  const phone = normalizePhone(input.phone);
  if (!phone || digitsOnly(phone).length < 10) {
    throw new AppError(400, "Enter a valid phone number with at least 10 digits");
  }

  const gender = (input.gender ?? "").trim();
  const condition = (input.condition ?? "").trim();
  const age =
    typeof input.age === "number" && Number.isFinite(input.age) && input.age > 0
      ? Math.min(130, Math.round(input.age))
      : null;

  let patient = await findPatientByPhone(phone);
  let createdNew = false;

  if (patient) {
    const history = await prisma.patientMedicalHistory.findUnique({
      where: { userId: patient.id },
    });
    const nextConditions = condition
      ? [condition, ...(history?.conditions ?? []).filter((row) => row !== condition)]
      : (history?.conditions ?? []);

    await prisma.patientMedicalHistory.upsert({
      where: { userId: patient.id },
      create: {
        userId: patient.id,
        phone,
        age: age ?? undefined,
        gender,
        conditions: condition ? [condition] : [],
      },
      update: {
        phone,
        ...(age != null ? { age } : {}),
        ...(gender ? { gender } : {}),
        ...(condition ? { conditions: nextConditions } : {}),
      },
    });

    patient = await prisma.user.update({
      where: { id: patient.id },
      data: {
        fullName,
        phone: patient.phone?.trim() ? patient.phone : phone,
      },
    });
  } else {
    let email: string;
    if (input.email?.trim()) {
      email = input.email.trim().toLowerCase();
      const taken = await prisma.user.findUnique({ where: { email } });
      if (taken) throw new AppError(409, "An account with this email already exists");
    } else {
      email = await uniquePatientEmail(placeholderPatientEmail(phone));
    }

    const reference = await generateUniqueReference(toPrismaRole("patient"));
    const passwordHash = await hashPassword(crypto.randomBytes(16).toString("hex"));

    patient = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          fullName,
          passwordHash,
          role: "PATIENT",
          reference,
          isActive: true,
          phone,
        },
      });

      await tx.patientMedicalHistory.create({
        data: {
          userId: created.id,
          phone,
          age: age ?? undefined,
          gender,
          conditions: condition ? [condition] : [],
        },
      });

      return created;
    });
    createdNew = true;

    await logPatientActivity({
      userId: patient.id,
      type: "patient_registered_by_doctor",
      label: "Added by doctor",
      detail: `Patient file created from clinic patient list (${phone})`,
    }).catch(() => undefined);
  }

  await ensureDoctorPatientLink(
    doctorUserId,
    patient.id,
    createdNew
      ? "Patient added to your clinic list."
      : "Existing patient linked to your clinic list.",
  );

  const full = await prisma.user.findUnique({
    where: { id: patient.id },
    include: {
      medicalHistory: true,
      patientAppointments: {
        where: { AND: [{ doctorUserId }, excludeUnconfirmedVoiceHold] },
        orderBy: { startsAt: "desc" },
      },
    },
  });
  if (!full) throw new AppError(500, "Patient was created but could not be loaded");

  return {
    patient: toPublicPatient(full),
    created: createdNew,
    message: createdNew
      ? `${fullName} was added to your patient list.`
      : `${fullName} was already registered and is now on your patient list.`,
  };
}

export async function updatePatientForDoctor(
  doctorUserId: string,
  patientId: string,
  input: {
    fullName: string;
    phone: string;
    email?: string;
    age?: number | null;
    gender?: string;
    condition?: string;
  },
) {
  await assertDoctor(doctorUserId);
  const linkedIds = await linkedPatientIdsForDoctor(doctorUserId);
  if (!linkedIds.includes(patientId)) {
    throw new AppError(404, "Patient not found in your clinic list");
  }

  const existing = await prisma.user.findUnique({
    where: { id: patientId },
    include: { medicalHistory: true },
  });
  if (!existing || existing.role !== "PATIENT") {
    throw new AppError(404, "Patient not found");
  }

  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (fullName.length < 2) {
    throw new AppError(400, "Patient full name is required");
  }

  const phone = normalizePhone(input.phone);
  if (!phone || digitsOnly(phone).length < 10) {
    throw new AppError(400, "Enter a valid phone number with at least 10 digits");
  }

  const gender = (input.gender ?? "").trim();
  const condition = (input.condition ?? "").trim();
  const age =
    typeof input.age === "number" && Number.isFinite(input.age) && input.age > 0
      ? Math.min(130, Math.round(input.age))
      : null;

  let nextEmail = existing.email;
  if (input.email?.trim()) {
    const candidate = input.email.trim().toLowerCase();
    const taken = await prisma.user.findUnique({ where: { email: candidate } });
    if (taken && taken.id !== patientId) {
      throw new AppError(409, "An account with this email already exists");
    }
    nextEmail = candidate;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: patientId },
      data: {
        fullName,
        phone,
        email: nextEmail,
      },
    });

    const history = existing.medicalHistory;
    const nextConditions = condition
      ? [condition, ...(history?.conditions ?? []).filter((row) => row !== condition)]
      : condition === "" && input.condition !== undefined
        ? history?.conditions ?? []
        : history?.conditions ?? [];

    await tx.patientMedicalHistory.upsert({
      where: { userId: patientId },
      create: {
        userId: patientId,
        phone,
        age: age ?? undefined,
        gender,
        conditions: condition ? [condition] : [],
      },
      update: {
        phone,
        age: age ?? null,
        gender,
        ...(input.condition !== undefined
          ? { conditions: condition ? nextConditions : [] }
          : {}),
      },
    });
  });

  const full = await prisma.user.findUnique({
    where: { id: patientId },
    include: {
      medicalHistory: true,
      patientAppointments: {
        where: { AND: [{ doctorUserId }, excludeUnconfirmedVoiceHold] },
        orderBy: { startsAt: "desc" },
      },
    },
  });
  if (!full) throw new AppError(500, "Patient was updated but could not be loaded");

  return {
    patient: toPublicPatient(full),
    message: `${fullName} was updated.`,
  };
}

export async function deletePatientForDoctor(doctorUserId: string, patientId: string) {
  await assertDoctor(doctorUserId);
  const linkedIds = await linkedPatientIdsForDoctor(doctorUserId);
  if (!linkedIds.includes(patientId)) {
    throw new AppError(404, "Patient not found in your clinic list");
  }

  const patient = await prisma.user.findUnique({ where: { id: patientId } });
  if (!patient || patient.role !== "PATIENT") {
    throw new AppError(404, "Patient not found");
  }

  await prisma.$transaction(async (tx) => {
    // Appointments reference availability slots with Restrict — clear first.
    await tx.appointment.deleteMany({ where: { patientId } });
    await tx.user.delete({ where: { id: patientId } });
  });

  return { id: patient.id, fullName: patient.fullName };
}

export async function listPatientsForDoctor(doctorUserId: string, q?: string) {
  await assertDoctor(doctorUserId);

  const patientIds = await linkedPatientIdsForDoctor(doctorUserId);
  if (!patientIds.length) return [] as PublicDoctorPatient[];

  const patients = await prisma.user.findMany({
    where: {
      id: { in: patientIds },
      role: "PATIENT",
    },
    include: {
      medicalHistory: true,
      patientAppointments: {
        where: { AND: [{ doctorUserId }, excludeUnconfirmedVoiceHold] },
        orderBy: { startsAt: "desc" },
      },
    },
    orderBy: { fullName: "asc" },
  });

  return patients
    .map((patient) => toPublicPatient(patient))
    .filter((patient) => matchesQuery(patient, q ?? ""))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPatientFileForDoctor(doctorUserId: string, patientId: string) {
  await assertDoctor(doctorUserId);

  const linkedIds = await linkedPatientIdsForDoctor(doctorUserId);
  if (!linkedIds.includes(patientId)) {
    throw new AppError(404, "Patient not found in your list");
  }

  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    include: {
      medicalHistory: true,
      patientAppointments: {
        where: { AND: [{ doctorUserId }, excludeUnconfirmedVoiceHold] },
        orderBy: { startsAt: "desc" },
      },
      medicalRecords: {
        include: { appointment: { select: { id: true, reference: true, startsAt: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!patient || patient.role !== "PATIENT") {
    throw new AppError(404, "Patient not found");
  }

  await syncDoctorAppointmentInvoices(doctorUserId);

  const appointments = await prisma.appointment.findMany({
    where: { AND: [{ doctorUserId, patientId }, excludeUnconfirmedVoiceHold] },
    include: {
      patient: true,
      doctorUser: true,
      followUpOf: { select: { id: true, reference: true } },
      recordRequest: { include: { _count: { select: { records: true } } } },
      invoice: {
        select: {
          status: true,
          amountCents: true,
          currency: true,
          hostedInvoiceUrl: true,
          phone: true,
          smsError: true,
          sentAt: true,
          paidAt: true,
        },
      },
    },
    orderBy: { startsAt: "desc" },
  });

  const history = patient.medicalHistory;
  const records = patient.medicalRecords.map(toPublicRecord);
  const timeline = await buildPatientTimeline(doctorUserId, patientId);

  return {
    patient: toPublicPatient({
      ...patient,
      patientAppointments: patient.patientAppointments,
    }),
    appointments: appointments.map(toPublicAppointment),
    history: {
      fullName: patient.fullName,
      age: history?.age ?? null,
      bloodGroup: history?.bloodGroup ?? "",
      phone: history?.phone ?? "",
      symptoms: history?.symptoms ?? "",
      conditions: history?.conditions ?? [],
      allergies: history?.allergies ?? [],
      medications: history?.medications ?? [],
      surgeries: history?.surgeries ?? [],
      familyHistory: history?.familyHistory ?? [],
      updatedAt: history?.updatedAt.toISOString() ?? null,
    },
    records,
    recordGroups: groupRecords(records),
    timeline,
  } satisfies PublicDoctorPatientFile;
}
