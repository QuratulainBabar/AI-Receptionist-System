import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { digitsOnly, normalizePhone } from "../utils/phone.js";
import {
  generateUniqueReference,
  hashPassword,
  toPrismaRole,
} from "./auth.helpers.js";
import { logPatientActivity } from "./activity.service.js";
import { findPatientByPhone } from "./patient-phone.service.js";
import crypto from "node:crypto";

function placeholderEmail(phone: string) {
  const digits = digitsOnly(phone) || crypto.randomBytes(4).toString("hex");
  return `voice.${digits}@patients.receptionist.local`;
}

async function uniqueEmail(base: string) {
  const normalized = base.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });
  if (!existing) return normalized;
  const [local, domain] = normalized.split("@");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${local}+${suffix}@${domain || "patients.receptionist.local"}`;
}

export async function registerPatientFromPhone(input: {
  fullName: string;
  phone: string;
  email?: string;
}) {
  const phone = normalizePhone(input.phone);
  if (!phone) {
    throw new AppError(400, "A valid phone number is required to register a patient");
  }

  const name = input.fullName.trim();
  if (!name) {
    throw new AppError(400, "Patient full name is required");
  }

  const existing = await findPatientByPhone(phone);
  if (existing) return existing;

  const email = await uniqueEmail(
    input.email?.trim() || placeholderEmail(phone),
  );
  const reference = await generateUniqueReference(toPrismaRole("patient"));
  const passwordHash = await hashPassword(crypto.randomBytes(16).toString("hex"));

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        fullName: name,
        passwordHash,
        role: "PATIENT",
        reference,
        isActive: true,
      },
    });

    await tx.patientMedicalHistory.create({
      data: {
        userId: created.id,
        phone,
      },
    });

    return created;
  });

  await logPatientActivity({
    userId: user.id,
    type: "patient_registered_via_phone",
    label: "Registered via phone",
    detail: `Account created from AI receptionist call (${phone})`,
  }).catch(() => undefined);

  return user;
}

export async function findOrCreatePatientForVoice(input: {
  phone: string;
  fullName?: string;
  email?: string;
  allowCreate: boolean;
}): Promise<User | null> {
  const phone = normalizePhone(input.phone);
  if (!phone) return null;

  const existing = await findPatientByPhone(phone);
  if (existing) return existing;

  if (!input.allowCreate) return null;

  const name = input.fullName?.trim() || "Clinic caller";
  return registerPatientFromPhone({
    fullName: name,
    phone,
    email: input.email,
  });
}
