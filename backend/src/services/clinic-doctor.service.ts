import { prisma } from "../lib/prisma.js";
import { formatWeeklyHoursSummary, parseWeeklyHours } from "../utils/doctor-profile.js";
import { formatClinicDateTime } from "../utils/clinic-time.js";

export type ClinicDoctorRow = Awaited<ReturnType<typeof getClinicDoctor>>;

const UNSPECIFIED_SPECIALTY_ID = "unspecified";

function doctorInclude(openSlotsTake: number, now: Date) {
  return {
    user: true,
    specialty: true,
    availability: {
      where: { isBooked: false, startsAt: { gt: now } },
      orderBy: { startsAt: "asc" as const },
      take: openSlotsTake,
    },
  };
}

/**
 * One-to-one clinic doctor for the phone AI.
 * Uses the most recently updated active doctor who finished practice details
 * (specialty + hospital + fee) — not seed/verified ranking — so a new signup
 * that saves their profile becomes the clinic doctor after Sync.
 */
export async function getClinicDoctor(options?: { openSlotsTake?: number }) {
  const now = new Date();
  const take = options?.openSlotsTake ?? 8;
  const include = doctorInclude(take, now);

  const completed = await prisma.doctorProfile.findFirst({
    where: {
      user: { isActive: true, role: "DOCTOR" },
      clinic: { not: "" },
      fee: { not: "" },
      specialtyId: { not: UNSPECIFIED_SPECIALTY_ID },
    },
    include,
    orderBy: { updatedAt: "desc" },
  });
  if (completed) return completed;

  return prisma.doctorProfile.findFirst({
    where: { user: { isActive: true, role: "DOCTOR" } },
    include,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getClinicDoctorUserId() {
  const doctor = await getClinicDoctor({ openSlotsTake: 1 });
  return doctor?.userId ?? null;
}

export function formatOpenSlotLabels(
  slots: Array<{ id: string; startsAt: Date }>,
  options?: { withIds?: boolean; limit?: number },
) {
  const limit = options?.limit ?? slots.length;
  const withIds = options?.withIds !== false;
  return slots.slice(0, limit).map((slot) => {
    const when = formatClinicDateTime(slot.startsAt);
    return withIds ? `${when} [slot:${slot.id}]` : when;
  });
}

/** Fee text the agent may speak. Empty when this doctor has no consultation fee. */
export function consultationFeeToSpeak(fee: string | null | undefined) {
  const value = (fee ?? "").trim();
  if (!value || value.toLowerCase() === "none") return "";
  return value;
}

/** One opening sentence: doctor name, plus fee only when the profile has one. */
export function openingDoctorLine(doctorName: string, fee: string | null | undefined) {
  const name = doctorName.trim();
  if (!name) return "";
  const amount = consultationFeeToSpeak(fee);
  if (amount) return `Appointments are with ${name}. The consultation fee is ${amount}. `;
  return `Appointments are with ${name}. `;
}

/**
 * Keep the saved greeting, and insert the live doctor sentence.
 * `{opening_doctor_line}` is filled on each call from the inbound webhook.
 */
export function greetingWithOpeningLine(greeting: string) {
  const without = greeting
    .replace(/\{opening_doctor_line\}/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .trim();
  const base = without || "Hi, you've reached Qubetech AI Receptionist. How may I help you today?";
  const match = base.match(/^([\s\S]+?[.!?])\s+([\s\S]+)$/);
  if (match) return `${match[1]} {opening_doctor_line}${match[2]}`;
  return `${base} {opening_doctor_line}`.trim();
}

export function clinicDoctorProfileBlock(doctor: NonNullable<ClinicDoctorRow>) {
  const weeklyHoursSummary = formatWeeklyHoursSummary(parseWeeklyHours(doctor.weeklyHours));
  const slotLabels = formatOpenSlotLabels(doctor.availability, { withIds: true });
  return {
    doctorName: doctor.user.fullName,
    doctorId: doctor.userId,
    specialty: doctor.specialty.name,
    hospital: doctor.clinic || "none",
    fee: doctor.fee || "none",
    experienceYears: doctor.experienceYears,
    bio: doctor.about?.trim() || "none",
    weeklyHoursSummary: weeklyHoursSummary || "none",
    openSlots: slotLabels.length ? slotLabels.join("; ") : "none",
    qualifications: doctor.qualifications,
    certifications: doctor.certifications,
    areasOfExpertise: doctor.areasOfExpertise,
    languages: doctor.languages,
    location: doctor.location?.trim() || "",
  };
}
