import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { formatClinicDate, formatClinicTime } from "../utils/clinic-time.js";
import { excludeUnconfirmedVoiceHold, type PublicAppointment } from "./appointments.service.js";
import { fetchCallRecordingUrl } from "./synthflow.client.js";

export type AdminVoiceCallAppointment = {
  id: string;
  reference: string;
  startsAt: string;
  date: string;
  time: string;
  reason: string;
  specialty: string;
  clinic: string;
  status: string;
  doctorName: string;
};

export type AdminVoiceCallRow = {
  id: string;
  synthflowCallId: string | null;
  direction: string;
  status: string;
  fromNumber: string;
  toNumber: string;
  callerName: string | null;
  patientId: string | null;
  patientName: string | null;
  patientReference: string | null;
  doctorName: string | null;
  appointmentId: string | null;
  appointmentReference: string | null;
  appointmentStartsAt: string | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
  appointmentReason: string | null;
  appointmentSpecialty: string | null;
  appointmentClinic: string | null;
  appointmentStatus: string | null;
  durationSeconds: number | null;
  summary: string;
  endCallReason: string;
  hasTranscript: boolean;
  hasRecording: boolean;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
};

export type AdminVoiceCallDetail = AdminVoiceCallRow & {
  transcript: string;
  recordingUrl: string | null;
  modelId: string;
  metadata: unknown;
  appointment: AdminVoiceCallAppointment | null;
};

type VoiceCallListInclude = {
  id: string;
  synthflowCallId: string | null;
  direction: string;
  status: string;
  fromNumber: string;
  toNumber: string;
  callerName: string;
  patientId: string | null;
  durationSeconds: number | null;
  summary: string;
  endCallReason: string;
  transcript: string;
  recordingUrl: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  patient: { fullName: string; reference: string } | null;
  doctorUser: { fullName: string } | null;
  appointment: {
    id: string;
    reference: string;
    startsAt: Date;
    reason: string;
    specialtyName: string;
    clinic: string;
    status: string;
    doctorUser: { fullName: string };
  } | null;
};

function formatDateLabel(date: Date) {
  return formatClinicDate(date);
}

function formatTimeLabel(date: Date) {
  return formatClinicTime(date);
}

function isPlayableRecordingUrl(url: string | null | undefined) {
  const value = url?.trim() || "";
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (
      host === "example.com" ||
      host === "www.example.com" ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
      return false;
    }
  } catch {
    return false;
  }
  return true;
}

function resolveCallerName(row: VoiceCallListInclude) {
  const fromField = row.callerName?.trim();
  if (fromField) return fromField;
  return row.patient?.fullName ?? null;
}

function mapAppointment(row: VoiceCallListInclude["appointment"]): AdminVoiceCallAppointment | null {
  if (!row) return null;
  return {
    id: row.id,
    reference: row.reference,
    startsAt: row.startsAt.toISOString(),
    date: formatDateLabel(row.startsAt),
    time: formatTimeLabel(row.startsAt),
    reason: row.reason,
    specialty: row.specialtyName,
    clinic: row.clinic,
    status: row.status,
    doctorName: row.doctorUser.fullName,
  };
}

function mapVoiceCall(row: VoiceCallListInclude): AdminVoiceCallRow {
  const appointment = mapAppointment(row.appointment);
  return {
    id: row.id,
    synthflowCallId: row.synthflowCallId,
    direction: row.direction,
    status: row.status,
    fromNumber: row.fromNumber,
    toNumber: row.toNumber,
    callerName: resolveCallerName(row),
    patientId: row.patientId,
    patientName: row.patient?.fullName ?? null,
    patientReference: row.patient?.reference ?? null,
    doctorName: appointment?.doctorName ?? row.doctorUser?.fullName ?? null,
    appointmentId: appointment?.id ?? null,
    appointmentReference: appointment?.reference ?? null,
    appointmentStartsAt: appointment?.startsAt ?? null,
    appointmentDate: appointment?.date ?? null,
    appointmentTime: appointment?.time ?? null,
    appointmentReason: appointment?.reason ?? null,
    appointmentSpecialty: appointment?.specialty ?? null,
    appointmentClinic: appointment?.clinic ?? null,
    appointmentStatus: appointment?.status ?? null,
    durationSeconds: row.durationSeconds,
    summary: row.summary,
    endCallReason: row.endCallReason,
    hasTranscript: Boolean(row.transcript?.trim()),
    hasRecording: isPlayableRecordingUrl(row.recordingUrl),
    recordingUrl: isPlayableRecordingUrl(row.recordingUrl) ? row.recordingUrl : null,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const voiceCallInclude = {
  patient: { select: { fullName: true, reference: true } },
  doctorUser: { select: { fullName: true } },
  appointment: {
    select: {
      id: true,
      reference: true,
      startsAt: true,
      reason: true,
      specialtyName: true,
      clinic: true,
      status: true,
      doctorUser: { select: { fullName: true } },
    },
  },
} as const;

export async function listVoiceCallsForAdmin(input: { q?: string; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const q = input.q?.trim();

  const rows = await prisma.voiceCall.findMany({
    where: q
      ? {
          OR: [
            { fromNumber: { contains: q, mode: "insensitive" } },
            { toNumber: { contains: q, mode: "insensitive" } },
            { callerName: { contains: q, mode: "insensitive" } },
            { summary: { contains: q, mode: "insensitive" } },
            { patient: { fullName: { contains: q, mode: "insensitive" } } },
            { patient: { reference: { contains: q, mode: "insensitive" } } },
            { appointment: { reference: { contains: q, mode: "insensitive" } } },
            { doctorUser: { fullName: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined,
    include: voiceCallInclude,
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map(mapVoiceCall);
}

export async function getVoiceCallForAdmin(id: string): Promise<AdminVoiceCallDetail> {
  let row = await prisma.voiceCall.findUnique({
    where: { id },
    include: voiceCallInclude,
  });

  if (!row) {
    throw new AppError(404, "Voice call not found");
  }

  // Backfill real Synthflow recording URL when webhook didn't include one (or stored a placeholder).
  if (!isPlayableRecordingUrl(row.recordingUrl) && row.synthflowCallId) {
    const refreshed = await fetchCallRecordingUrl(row.synthflowCallId);
    if (refreshed && isPlayableRecordingUrl(refreshed)) {
      row = await prisma.voiceCall.update({
        where: { id: row.id },
        data: { recordingUrl: refreshed },
        include: voiceCallInclude,
      });
    }
  }

  return {
    ...mapVoiceCall(row),
    transcript: row.transcript,
    recordingUrl: isPlayableRecordingUrl(row.recordingUrl) ? row.recordingUrl : null,
    modelId: row.modelId,
    metadata: row.metadata,
    appointment: mapAppointment(row.appointment),
  };
}

export async function getVoiceCallRecordingSource(id: string) {
  const detail = await getVoiceCallForAdmin(id);
  const recordingUrl = detail.recordingUrl?.trim();
  if (!recordingUrl || !isPlayableRecordingUrl(recordingUrl)) {
    throw new AppError(
      404,
      "No playable Synthflow recording URL is available for this call yet",
    );
  }

  return {
    id: detail.id,
    recordingUrl,
    synthflowCallId: detail.synthflowCallId,
  };
}

function toPublicStatus(status: string): PublicAppointment["status"] {
  switch (status) {
    case "PENDING":
      return "pending";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "confirmed";
  }
}

function toPublicMode(mode: string): PublicAppointment["mode"] {
  return mode === "VIDEO_CALL" ? "Video call" : "In clinic";
}

export async function listAppointmentsForAdmin(input: { q?: string; limit?: number }) {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const q = input.q?.trim();

  const rows = await prisma.appointment.findMany({
    where: {
      AND: [
        excludeUnconfirmedVoiceHold,
        ...(q
          ? [
              {
                OR: [
                  { reference: { contains: q, mode: "insensitive" as const } },
                  { reason: { contains: q, mode: "insensitive" as const } },
                  { patient: { fullName: { contains: q, mode: "insensitive" as const } } },
                  { patient: { reference: { contains: q, mode: "insensitive" as const } } },
                  { doctorUser: { fullName: { contains: q, mode: "insensitive" as const } } },
                ],
              },
            ]
          : []),
      ],
    },
    include: {
      patient: true,
      doctorUser: true,
      followUpOf: { select: { id: true, reference: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map(mapPublicAppointment);
}

export type AdminAppointmentDetail = PublicAppointment & {
  patientEmail: string;
  patientReference: string;
  doctorEmail: string;
  createdAt: string;
  updatedAt: string;
  followUps: Array<{
    id: string;
    reference: string;
    date: string;
    time: string;
    status: string;
  }>;
  voiceCalls: Array<{
    id: string;
    status: string;
    fromNumber: string;
    startedAt: string | null;
    summary: string;
  }>;
};

function mapPublicAppointment(row: {
  id: string;
  reference: string;
  doctorUserId: string;
  doctorUser: { fullName: string };
  specialtyName: string;
  patientId: string;
  patient: { fullName: string };
  startsAt: Date;
  durationMinutes: number;
  mode: string;
  reason: string;
  status: string;
  clinic: string;
  fee: string;
  followUpOfId: string | null;
  followUpOf?: { reference: string } | null;
}): PublicAppointment {
  return {
    id: row.id,
    reference: row.reference,
    doctorId: row.doctorUserId,
    doctorName: row.doctorUser.fullName,
    speciality: row.specialtyName,
    patientId: row.patientId,
    patientName: row.patient.fullName,
    date: formatDateLabel(row.startsAt),
    time: formatTimeLabel(row.startsAt),
    duration: `${row.durationMinutes} min`,
    mode: toPublicMode(row.mode),
    reason: row.reason,
    status: toPublicStatus(row.status),
    clinic: row.clinic,
    fee: row.fee,
    startsAt: row.startsAt.toISOString(),
    followUpOfId: row.followUpOfId ?? null,
    followUpOfReference: row.followUpOf?.reference ?? null,
    isFollowUp: Boolean(row.followUpOfId),
    recordRequest: null,
    invoice: null,
  };
}

export async function getAppointmentForAdmin(appointmentId: string): Promise<AdminAppointmentDetail> {
  const row = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      doctorUser: true,
      followUpOf: { select: { id: true, reference: true } },
      followUps: { orderBy: { startsAt: "asc" }, take: 20 },
      voiceCalls: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!row) throw new AppError(404, "Appointment not found");

  return {
    ...mapPublicAppointment(row),
    patientEmail: row.patient.email,
    patientReference: row.patient.reference,
    doctorEmail: row.doctorUser.email,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    followUps: row.followUps.map((item) => ({
      id: item.id,
      reference: item.reference,
      date: formatDateLabel(item.startsAt),
      time: formatTimeLabel(item.startsAt),
      status: toPublicStatus(item.status),
    })),
    voiceCalls: row.voiceCalls.map((call) => ({
      id: call.id,
      status: call.status,
      fromNumber: call.fromNumber,
      startedAt: call.startedAt?.toISOString() ?? call.createdAt.toISOString(),
      summary: call.summary?.trim() || "",
    })),
  };
}
