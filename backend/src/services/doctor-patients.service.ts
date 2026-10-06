import type {
  Appointment,
  PatientMedicalHistory,
  PatientMedicalRecord,
  User,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { clinicTimeZone, formatClinicDate, formatClinicTime } from "../utils/clinic-time.js";
import { formatFileSize, formatRecordDate } from "./records.service.js";
import {
  syncDoctorAppointmentInvoices,
  toPublicAppointmentInvoice,
  type PublicAppointmentInvoice,
} from "./appointment-invoices.service.js";
import { buildPatientTimeline, type PatientTimelineEvent } from "./patient-chart.service.js";

export type PublicDoctorPatient = {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  reference: string;
  lastVisit: string;
  condition: string;
  phone: string;
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
  return {
    id: row.id,
    name: row.fullName,
    age: row.medicalHistory?.age ?? null,
    gender: row.medicalHistory?.gender?.trim() || "—",
    reference: row.reference,
    lastVisit: resolveLastVisit(row.patientAppointments),
    condition: resolveCondition(row.medicalHistory, row.patientAppointments),
    phone: row.medicalHistory?.phone ?? "",
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
    patient.condition.toLowerCase().includes(needle)
  );
}

async function assertDoctor(doctorUserId: string) {
  const doctor = await prisma.user.findUnique({ where: { id: doctorUserId } });
  if (!doctor || doctor.role !== "DOCTOR" || !doctor.isActive) {
    throw new AppError(403, "Only active doctors can view patients");
  }
  return doctor;
}

export async function listPatientsForDoctor(doctorUserId: string, q?: string) {
  await assertDoctor(doctorUserId);

  const appointments = await prisma.appointment.findMany({
    where: { doctorUserId },
    select: { patientId: true },
    distinct: ["patientId"],
  });

  const patientIds = appointments.map((row) => row.patientId);
  if (!patientIds.length) return [] as PublicDoctorPatient[];

  const patients = await prisma.user.findMany({
    where: {
      id: { in: patientIds },
      role: "PATIENT",
    },
    include: {
      medicalHistory: true,
      patientAppointments: {
        where: { doctorUserId },
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

  const linked = await prisma.appointment.findFirst({
    where: { doctorUserId, patientId },
  });
  if (!linked) {
    throw new AppError(404, "Patient not found in your list");
  }

  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    include: {
      medicalHistory: true,
      patientAppointments: {
        where: { doctorUserId },
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
    where: { doctorUserId, patientId },
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
