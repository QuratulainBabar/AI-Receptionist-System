import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { normalizePhone } from "../utils/phone.js";
import {
  cancelOtpHold,
  confirmHeldAppointment,
  createAppointment,
  getPublicAppointmentById,
  releaseExpiredOtpHolds,
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
  const words = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let fromWords = "";
  for (const word of words) {
    if (/^\d+$/.test(word)) fromWords += word;
    else if (SPOKEN_DIGITS[word]) fromWords += SPOKEN_DIGITS[word];
  }
  if (fromWords.length === 6) return fromWords;
  const digits = raw.replace(/\D/g, "");
  return digits.length === 6 ? digits : "";
}

function generateCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
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

export async function verifyBookingOtp(input: { phone: string; otp: string; callerPhone?: string }) {
  const phones = uniquePhones(input.phone, input.callerPhone);
  const code = parseSpokenOtp(input.otp);

  if (!phones.length || !code) {
    return {
      success: false,
      appointment_confirmed: false,
      message:
        "That code is not valid. The appointment is not confirmed. Please read the six digits from the text message.",
    };
  }

  const row = await prisma.appointmentOtp.findFirst({
    where: {
      phone: { in: phones },
      usedAt: null,
      appointment: { status: "PENDING" },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!row) {
    const latest = await prisma.appointmentOtp.findFirst({
      where: { phone: { in: phones } },
      orderBy: { createdAt: "desc" },
      include: { appointment: true },
    });
    const held = latest?.appointment.status === "PENDING";
    if (held && latest) await cancelOtpHold(latest.appointmentId);
    return {
      success: false,
      appointment_confirmed: false,
      message: latest?.usedAt
        ? held
          ? "That code was already used. The appointment is not confirmed, and that time has been released."
          : "That code was already used. The appointment is not confirmed."
        : "There is no verification code waiting for this number. The appointment is not confirmed.",
    };
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.appointmentOtp.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await cancelOtpHold(row.appointmentId);
    return {
      success: false,
      appointment_confirmed: false,
      message: "That code has expired. The appointment is not confirmed, and that time has been released.",
    };
  }

  if (!hashesMatch(row.codeHash, hashOtp(code))) {
    await prisma.appointmentOtp.update({
      where: { id: row.id },
      data: { attempts: row.attempts + 1, usedAt: new Date() },
    });
    await cancelOtpHold(row.appointmentId);
    return {
      success: false,
      appointment_confirmed: false,
      message: "That code is incorrect. The appointment is not confirmed, and that time has been released.",
    };
  }

  const claimed = await prisma.appointmentOtp.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    await cancelOtpHold(row.appointmentId);
    return {
      success: false,
      appointment_confirmed: false,
      message: "That code was already used. The appointment is not confirmed.",
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
      message: `The code is correct. Your appointment is confirmed. Reference ${appointment.reference} with ${appointment.doctorName} on ${appointment.date} at ${appointment.time}.`,
    };
  } catch (error) {
    await cancelOtpHold(row.appointmentId);
    return {
      success: false,
      appointment_confirmed: false,
      message:
        error instanceof AppError
          ? `${error.message} The appointment is not confirmed.`
          : "The code could not be verified. The appointment is not confirmed.",
    };
  }
}
