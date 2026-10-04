import type {
  Appointment,
  PatientMedicalHistory,
  PatientMedicalRecord,
  User,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { formatFileSize, formatRecordDate } from "./records.service.js";

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
  }>;
};

type PatientWithRelations = User & {
  medicalHistory: PatientMedicalHistory | null;
  patientAppointments: Appointment[];
};

function formatLastVisitLabel(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAppointmentDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatAppointmentTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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
  };
}

function toPublicRecord(record: PatientMedicalRecord) {
  return {
    id: record.id,
    name: record.fileName,
    type: record.category,
    date: formatRecordDate(record.createdAt),
    size: formatFileSize(record.sizeBytes),
    uploadedBy: record.uploadedBy,
    mimeType: record.mimeType,
  };
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
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!patient || patient.role !== "PATIENT") {
    throw new AppError(404, "Patient not found");
  }

  const appointments = await prisma.appointment.findMany({
    where: { doctorUserId, patientId },
    include: {
      patient: true,
      doctorUser: true,
      followUpOf: { select: { id: true, reference: true } },
    },
    orderBy: { startsAt: "desc" },
  });

  const history = patient.medicalHistory;

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
    records: patient.medicalRecords.map(toPublicRecord),
  } satisfies PublicDoctorPatientFile;
}
