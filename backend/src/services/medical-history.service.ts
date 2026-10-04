import type { PatientMedicalHistory, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { logHistoryUpsert } from "./activity.service.js";

export type PublicMedicalHistory = {
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

function toPublic(user: User, history: PatientMedicalHistory | null): PublicMedicalHistory {
  return {
    fullName: user.fullName,
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
  };
}

function normalizeList(items: string[] | undefined) {
  return (items ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function getMedicalHistoryForPatient(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { medicalHistory: true },
  });

  if (!user || user.role !== "PATIENT") {
    throw new AppError(404, "Patient not found");
  }

  return toPublic(user, user.medicalHistory);
}

export async function upsertMedicalHistoryForPatient(
  userId: string,
  input: {
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
  },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "PATIENT" || !user.isActive) {
    throw new AppError(403, "Only active patients can update medical history");
  }

  const fullName = input.fullName.trim();
  if (!fullName) {
    throw new AppError(400, "Full name is required");
  }

  const previous = await prisma.patientMedicalHistory.findUnique({ where: { userId } });

  const [updatedUser, history] = await prisma.$transaction(async (tx) => {
    const nextUser = await tx.user.update({
      where: { id: userId },
      data: { fullName },
    });

    const nextHistory = await tx.patientMedicalHistory.upsert({
      where: { userId },
      update: {
        age: input.age,
        bloodGroup: input.bloodGroup.trim(),
        phone: input.phone.trim(),
        symptoms: input.symptoms.trim(),
        conditions: normalizeList(input.conditions),
        allergies: normalizeList(input.allergies),
        medications: normalizeList(input.medications),
        surgeries: normalizeList(input.surgeries),
        familyHistory: normalizeList(input.familyHistory),
      },
      create: {
        userId,
        age: input.age,
        bloodGroup: input.bloodGroup.trim(),
        phone: input.phone.trim(),
        symptoms: input.symptoms.trim(),
        conditions: normalizeList(input.conditions),
        allergies: normalizeList(input.allergies),
        medications: normalizeList(input.medications),
        surgeries: normalizeList(input.surgeries),
        familyHistory: normalizeList(input.familyHistory),
      },
    });

    return [nextUser, nextHistory] as const;
  });

  await logHistoryUpsert(userId, previous, history);

  return toPublic(updatedUser, history);
}
