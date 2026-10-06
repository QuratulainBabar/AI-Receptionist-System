import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { formatClinicDate, formatClinicTime } from "../utils/clinic-time.js";

export type PatientTimelineKind =
  | "visit"
  | "follow_up"
  | "status"
  | "report"
  | "prescription"
  | "note"
  | "transcription";

export type PatientTimelineEvent = {
  id: string;
  kind: PatientTimelineKind;
  occurredAt: string;
  dateLabel: string;
  timeLabel: string;
  title: string;
  detail: string;
  appointmentId: string | null;
  appointmentReference: string | null;
  status: string | null;
  recordId: string | null;
};

function statusLabel(status: string) {
  switch (status) {
    case "PENDING":
      return "pending";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    case "CONFIRMED":
      return "confirmed";
    default:
      return status.toLowerCase();
  }
}

function stamp(date: Date) {
  return {
    occurredAt: date.toISOString(),
    dateLabel: formatClinicDate(date),
    timeLabel: formatClinicTime(date),
  };
}

export async function recordAppointmentStatus(input: {
  appointmentId: string;
  patientId: string;
  doctorUserId: string;
  fromStatus: string;
  toStatus: string;
  occurredAt?: Date;
}) {
  if (input.fromStatus === input.toStatus) return;
  await prisma.appointmentStatusEvent.create({
    data: {
      appointmentId: input.appointmentId,
      patientId: input.patientId,
      doctorUserId: input.doctorUserId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}

async function assertPatientInDoctorList(doctorUserId: string, patientId: string) {
  const linked = await prisma.appointment.findFirst({
    where: { doctorUserId, patientId },
    select: { id: true },
  });
  if (!linked) throw new AppError(404, "Patient not found in your list");
}

async function assertAppointmentLink(doctorUserId: string, patientId: string, appointmentId?: string) {
  if (!appointmentId) return null;
  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, doctorUserId, patientId },
    select: { id: true, reference: true },
  });
  if (!appointment) throw new AppError(404, "Appointment not found for this patient");
  return appointment;
}

export async function addClinicalNote(input: {
  doctorUserId: string;
  patientId: string;
  appointmentId?: string;
  body: string;
}) {
  await assertPatientInDoctorList(input.doctorUserId, input.patientId);
  const body = input.body.trim();
  if (!body) throw new AppError(400, "Write a note before saving.");
  await assertAppointmentLink(input.doctorUserId, input.patientId, input.appointmentId);
  return prisma.clinicalNote.create({
    data: {
      patientId: input.patientId,
      doctorUserId: input.doctorUserId,
      appointmentId: input.appointmentId || null,
      body,
    },
  });
}

export async function addDoctorPrescription(input: {
  doctorUserId: string;
  patientId: string;
  appointmentId?: string;
  medication: string;
  dosage?: string;
  instructions?: string;
}) {
  await assertPatientInDoctorList(input.doctorUserId, input.patientId);
  const medication = input.medication.trim();
  if (!medication) throw new AppError(400, "Enter the medication name.");
  await assertAppointmentLink(input.doctorUserId, input.patientId, input.appointmentId);
  return prisma.doctorPrescription.create({
    data: {
      patientId: input.patientId,
      doctorUserId: input.doctorUserId,
      appointmentId: input.appointmentId || null,
      medication,
      dosage: input.dosage?.trim() || "",
      instructions: input.instructions?.trim() || "",
    },
  });
}

function isPrescriptionFile(category: string) {
  return category.toLowerCase().includes("prescription");
}

export async function buildPatientTimeline(doctorUserId: string, patientId: string): Promise<PatientTimelineEvent[]> {
  const [appointments, records, notes, prescriptions, calls] = await Promise.all([
    prisma.appointment.findMany({
      where: { doctorUserId, patientId },
      include: {
        followUpOf: { select: { reference: true } },
        statusEvents: { orderBy: { occurredAt: "desc" } },
      },
    }),
    prisma.patientMedicalRecord.findMany({
      where: {
        userId: patientId,
        OR: [{ appointmentId: null }, { appointment: { doctorUserId } }],
      },
      include: { appointment: { select: { id: true, reference: true, doctorUserId: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.clinicalNote.findMany({
      where: { patientId, doctorUserId },
      include: { appointment: { select: { reference: true } }, doctorUser: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.doctorPrescription.findMany({
      where: { patientId, doctorUserId },
      include: { appointment: { select: { reference: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.voiceCall.findMany({
      where: {
        patientId,
        OR: [{ doctorUserId }, { appointment: { doctorUserId } }],
      },
      include: { appointment: { select: { id: true, reference: true } } },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  const events: PatientTimelineEvent[] = [];

  for (const appointment of appointments) {
    const reference = appointment.reference;
    const followUp = Boolean(appointment.followUpOfId);
    const when = stamp(appointment.startsAt);
    const mode = appointment.mode === "VIDEO_CALL" ? "Video call" : "In clinic";
    events.push({
      id: `visit-${appointment.id}`,
      kind: followUp ? "follow_up" : "visit",
      ...when,
      title: followUp ? `Follow-up ${reference}` : `Visit ${reference}`,
      detail: [
        `${when.timeLabel} · ${mode}`,
        appointment.reason.trim() ? appointment.reason.trim() : "",
        followUp && appointment.followUpOf?.reference
          ? `Follow-up of ${appointment.followUpOf.reference}`
          : "",
        `Status ${statusLabel(appointment.status)}`,
      ]
        .filter(Boolean)
        .join("\n"),
      appointmentId: appointment.id,
      appointmentReference: reference,
      status: statusLabel(appointment.status),
      recordId: null,
    });

    const statusRows = appointment.statusEvents.length
      ? appointment.statusEvents
      : [
          {
            id: `current-${appointment.id}`,
            fromStatus: "",
            toStatus: appointment.status,
            occurredAt: appointment.updatedAt,
          },
        ];

    for (const row of statusRows) {
      const at = stamp(row.occurredAt);
      const to = statusLabel(row.toStatus);
      const from = row.fromStatus ? statusLabel(row.fromStatus) : "";
      events.push({
        id: `status-${row.id}`,
        kind: "status",
        ...at,
        title: from ? `${reference} changed from ${from} to ${to}` : `${reference} status is ${to}`,
        detail: from ? `Previous status ${from}.` : "Recorded from the current appointment status.",
        appointmentId: appointment.id,
        appointmentReference: reference,
        status: to,
        recordId: null,
      });
    }
  }

  for (const record of records) {
    if (record.appointment && record.appointment.doctorUserId !== doctorUserId) continue;
    const at = stamp(record.createdAt);
    const prescription = isPrescriptionFile(record.category);
    events.push({
      id: `record-${record.id}`,
      kind: prescription ? "prescription" : "report",
      ...at,
      title: prescription ? `Prescription file · ${record.fileName}` : `${record.category || "Report"} · ${record.fileName}`,
      detail: record.appointment?.reference
        ? `Linked to ${record.appointment.reference}. Uploaded by ${record.uploadedBy}.`
        : `Uploaded by ${record.uploadedBy}.`,
      appointmentId: record.appointmentId,
      appointmentReference: record.appointment?.reference ?? null,
      status: null,
      recordId: record.id,
    });
  }

  for (const note of notes) {
    const at = stamp(note.createdAt);
    events.push({
      id: `note-${note.id}`,
      kind: "note",
      ...at,
      title: note.appointment?.reference
        ? `Doctor note · ${note.appointment.reference}`
        : "Doctor note",
      detail: `${note.doctorUser.fullName}\n${note.body}`,
      appointmentId: note.appointmentId,
      appointmentReference: note.appointment?.reference ?? null,
      status: null,
      recordId: null,
    });
  }

  for (const prescription of prescriptions) {
    const at = stamp(prescription.createdAt);
    const lines = [
      prescription.medication,
      prescription.dosage ? `Dosage: ${prescription.dosage}` : "",
      prescription.instructions ? prescription.instructions : "",
      prescription.appointment?.reference ? `Linked to ${prescription.appointment.reference}.` : "",
    ].filter(Boolean);
    events.push({
      id: `rx-${prescription.id}`,
      kind: "prescription",
      ...at,
      title: `Prescription · ${prescription.medication}`,
      detail: lines.join("\n"),
      appointmentId: prescription.appointmentId,
      appointmentReference: prescription.appointment?.reference ?? null,
      status: null,
      recordId: null,
    });
  }

  for (const call of calls) {
    const transcript = call.transcript.trim();
    const summary = call.summary.trim();
    if (!transcript && !summary) continue;
    const at = stamp(call.startedAt ?? call.createdAt);
    events.push({
      id: `call-${call.id}`,
      kind: "transcription",
      ...at,
      title: call.appointment?.reference
        ? `Call transcription · ${call.appointment.reference}`
        : "Call transcription",
      detail: [summary, transcript].filter(Boolean).join("\n\n"),
      appointmentId: call.appointmentId,
      appointmentReference: call.appointment?.reference ?? null,
      status: null,
      recordId: null,
    });
  }

  events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return events;
}
