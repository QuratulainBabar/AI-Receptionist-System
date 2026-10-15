import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { normalizePhone } from "../utils/phone.js";
import {
  cancelOtpHold,
  confirmHeldAppointment,
  createAppointment,
  getPublicAppointmentById,
  detachCancelledFromSlot,
  releaseExpiredOtpHolds,
  releaseOtpHoldOnSlot,
  type PublicAppointment,
} from "./appointments.service.js";

const SPOKEN_DIGITS: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

function hashOtp(code: string) {
  return createHmac("sha256", env.JWT_SECRET).update(code).digest("hex");
}

function hashesMatch(stored: string, candidate: string) {
  const a = Buffer.from(stored);
  const b = Buffer.from(candidate);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseSpokenOtp(raw: string) {
  const text = (raw || "").toLowerCase().trim();
  if (!text) return "";

  // Prefer an exact 6-digit run (e.g. "the code is 123456").
  const sixRun = text.match(/(?<!\d)\d{6}(?!\d)/);
  if (sixRun?.[0]) return sixRun[0];

  const words = text
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let fromWords = "";
  for (const word of words) {
    if (/^\d+$/.test(word)) fromWords += word;
    else if (SPOKEN_DIGITS[word]) fromWords += SPOKEN_DIGITS[word];
  }
  if (fromWords.length >= 6) return fromWords.slice(0, 6);
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 6) return digits.slice(0, 6);
  return "";
}

/**
 * Temporary testing OTP. The visit is not confirmed unless the caller says this code.
 * Replace with a random one-time code when SMS OTP testing is finished.
 */
export const TEMP_TEST_BOOKING_OTP = "123456";

function generateCode() {
  return TEMP_TEST_BOOKING_OTP;
}

async function storeCode(input: { phone: string; appointmentId: string }) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);
  await prisma.appointmentOtp.create({
    data: {
      phone: input.phone,
      codeHash: hashOtp(code),
      expiresAt,
      appointmentId: input.appointmentId,
    },
  });
  return { code, expiresAt, expiresSeconds: env.OTP_TTL_SECONDS };
}

export async function issueBookingOtp(input: {
  patientId: string;
  doctorId: string;
  slotId: string;
  reason: string;
  phone: string;
}): Promise<{ appointment: PublicAppointment; otpRequired: true; otp: string; expiresSeconds: number }> {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw new AppError(400, "A mobile number is required before I can send the verification code.");
  }

  await releaseExpiredOtpHolds();

  // Drop this patient's other PENDING holds so a prior failed OTP attempt cannot block a new slot.
  const otherHolds = await prisma.appointment.findMany({
    where: {
      patientId: input.patientId,
      status: "PENDING",
      slotId: { not: input.slotId },
    },
    select: { id: true },
  });
  for (const hold of otherHolds) {
    await cancelOtpHold(hold.id);
  }

  const open = await prisma.appointmentOtp.findFirst({
    where: {
      phone,
      usedAt: null,
      expiresAt: { gt: new Date() },
      appointment: { status: "PENDING" },
    },
    orderBy: { createdAt: "desc" },
    include: { appointment: true },
  });

  if (open && open.appointment.slotId === input.slotId && open.appointment.patientId === input.patientId) {
    await prisma.appointmentOtp.update({
      where: { id: open.id },
      data: { usedAt: new Date() },
    });
    const issued = await storeCode({ phone, appointmentId: open.appointmentId });
    const appointment = await getPublicAppointmentById(open.appointmentId);
    if (!appointment || appointment.status !== "pending") {
      throw new AppError(409, "The verification code could not be prepared. The appointment is not confirmed.");
    }
    return { appointment, otpRequired: true, otp: issued.code, expiresSeconds: issued.expiresSeconds };
  }

  if (open) {
    await prisma.appointmentOtp.update({
      where: { id: open.id },
      data: { usedAt: new Date() },
    });
    await cancelOtpHold(open.appointmentId);
  }

  // Reuse or clear any PENDING hold already occupying this slot (avoids slotId unique crash).
  const slotHold = await prisma.appointment.findFirst({
    where: { slotId: input.slotId, status: "PENDING" },
  });
  if (slotHold) {
    if (slotHold.patientId === input.patientId) {
      await prisma.appointmentOtp.updateMany({
        where: { appointmentId: slotHold.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      const issued = await storeCode({ phone, appointmentId: slotHold.id });
      const appointment = await getPublicAppointmentById(slotHold.id);
      if (!appointment || appointment.status !== "pending") {
        throw new AppError(409, "The verification code could not be prepared. The appointment is not confirmed.");
      }
      return { appointment, otpRequired: true, otp: issued.code, expiresSeconds: issued.expiresSeconds };
    }
    await cancelOtpHold(slotHold.id);
  } else {
    // Slot may still be marked booked from a deleted hold race — ensure clean claim path.
    await releaseOtpHoldOnSlot(input.slotId);
  }
  await detachCancelledFromSlot(input.slotId);

  try {
    const appointment = await createAppointment({
      patientId: input.patientId,
      doctorId: input.doctorId,
      slotId: input.slotId,
      reason: input.reason,
      phone,
      holdForOtp: true,
    });
    const issued = await storeCode({ phone, appointmentId: appointment.id });
    return { appointment, otpRequired: true, otp: issued.code, expiresSeconds: issued.expiresSeconds };
  } catch (error) {
    // Last resort: if another hold raced onto the slot, clear and retry once.
    const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
    const message = error instanceof Error ? error.message : "";
    if (code === "P2002" || message.includes("Unique constraint") || message.includes("slotId")) {
      await releaseOtpHoldOnSlot(input.slotId);
      await detachCancelledFromSlot(input.slotId);
      const appointment = await createAppointment({
        patientId: input.patientId,
        doctorId: input.doctorId,
        slotId: input.slotId,
        reason: input.reason,
        phone,
        holdForOtp: true,
      });
      const issued = await storeCode({ phone, appointmentId: appointment.id });
      return { appointment, otpRequired: true, otp: issued.code, expiresSeconds: issued.expiresSeconds };
    }
    throw error;
  }
}

function uniquePhones(...values: Array<string | undefined>) {
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const value of values) {
    const phone = normalizePhone(value);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    phones.push(phone);
  }
  return phones;
}

async function findPendingOtpForPhones(phones: string[], opts?: { allowUsed?: boolean }) {
  return prisma.appointmentOtp.findFirst({
    where: {
      phone: { in: phones },
      ...(opts?.allowUsed ? {} : { usedAt: null }),
      appointment: { status: "PENDING" },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function confirmOtpAppointment(appointmentId: string, otpRowId: string) {
  await prisma.appointmentOtp.update({
    where: { id: otpRowId },
    data: { usedAt: new Date() },
  });
  try {
    const appointment = await confirmHeldAppointment(appointmentId);
    return {
      success: true,
      appointment_confirmed: true,
      reference: appointment.reference,
      doctor: appointment.doctorName,
      date: appointment.date,
      time: appointment.time,
      appointment_booked: true,
      message: `The code is correct. Your appointment is confirmed. Reference ${appointment.reference} with ${appointment.doctorName} on ${appointment.date} at ${appointment.time}.`,
    };
  } catch (error) {
    await cancelOtpHold(appointmentId);
    return {
      success: false,
      appointment_confirmed: false,
      message:
        error instanceof AppError
          ? `${error.message} The appointment is not booked and not confirmed.`
          : "The code could not be verified. The appointment is not booked and not confirmed.",
    };
  }
}

export async function verifyBookingOtp(input: { phone: string; otp: string; callerPhone?: string }) {
  const phones = uniquePhones(input.phone, input.callerPhone);
  const code = parseSpokenOtp(input.otp);
  const isTestOtp = code === TEMP_TEST_BOOKING_OTP;

  if (!phones.length || !code) {
    return {
      success: false,
      appointment_confirmed: false,
      message:
        "That code is not valid. The appointment is not booked and not confirmed. Please say the six-digit verification code.",
    };
  }

  // Testing OTP 123456 may be reused unlimited times for any pending hold on this phone.
  if (isTestOtp) {
    const testRow = await findPendingOtpForPhones(phones, { allowUsed: true });
    if (!testRow) {
      return {
        success: false,
        appointment_confirmed: false,
        message:
          "There is no appointment waiting for verification on this number. The appointment is not booked and not confirmed.",
      };
    }
    return confirmOtpAppointment(testRow.appointmentId, testRow.id);
  }

  const row = await findPendingOtpForPhones(phones);

  if (!row) {
    const latest = await prisma.appointmentOtp.findFirst({
      where: { phone: { in: phones } },
      orderBy: { createdAt: "desc" },
      include: { appointment: true },
    });
    return {
      success: false,
      appointment_confirmed: false,
      message: latest?.appointment.status === "PENDING"
        ? "Please say the six-digit verification code again. The appointment is not booked yet."
        : latest?.usedAt
          ? "That code was already used. The appointment is not booked and not confirmed."
          : "There is no verification code waiting for this number. The appointment is not booked and not confirmed.",
    };
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.appointmentOtp.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await cancelOtpHold(row.appointmentId);
    return {
      success: false,
      appointment_confirmed: false,
      message: "That code has expired. The appointment is not booked and not confirmed, and that time has been released.",
    };
  }

  if (!hashesMatch(row.codeHash, hashOtp(code))) {
    // Keep the hold open so the caller can retry (especially while testing).
    await prisma.appointmentOtp.update({
      where: { id: row.id },
      data: { attempts: row.attempts + 1 },
    });
    return {
      success: false,
      appointment_confirmed: false,
      message:
        "That code is incorrect. The appointment is not booked and not confirmed. Please say the six-digit verification code again.",
    };
  }

  const claimed = await prisma.appointmentOtp.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    // Race: another verify won — if still PENDING, confirm via that row path.
    const again = await findPendingOtpForPhones(phones, { allowUsed: true });
    if (again && hashesMatch(again.codeHash, hashOtp(code))) {
      return confirmOtpAppointment(again.appointmentId, again.id);
    }
    return {
      success: false,
      appointment_confirmed: false,
      message: "Please say the six-digit verification code again. The appointment is not booked yet.",
    };
  }

  try {
    const appointment = await confirmHeldAppointment(row.appointmentId);
    return {
      success: true,
      appointment_confirmed: true,
      reference: appointment.reference,
      doctor: appointment.doctorName,
      date: appointment.date,
      time: appointment.time,
      appointment_booked: true,
      message: `The code is correct. Your appointment is confirmed. Reference ${appointment.reference} with ${appointment.doctorName} on ${appointment.date} at ${appointment.time}.`,
    };
  } catch (error) {
    await cancelOtpHold(row.appointmentId);
    return {
      success: false,
      appointment_confirmed: false,
      message:
        error instanceof AppError
          ? `${error.message} The appointment is not booked and not confirmed.`
          : "The code could not be verified. The appointment is not booked and not confirmed.",
    };
  }
}
