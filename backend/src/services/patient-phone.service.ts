import { prisma } from "../lib/prisma.js";
import { normalizePhone, phonesMatch } from "../utils/phone.js";

export async function findPatientIdsByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return [] as string[];

  const histories = await prisma.patientMedicalHistory.findMany({
    where: { phone: { not: "" } },
    include: { user: true },
    take: 500,
  });

  return histories
    .filter(
      (row) =>
        phonesMatch(row.phone, normalized) &&
        row.user.role === "PATIENT" &&
        row.user.isActive,
    )
    .map((row) => row.userId);
}

export async function findPatientByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const histories = await prisma.patientMedicalHistory.findMany({
    where: { phone: { not: "" } },
    include: { user: true },
    take: 500,
  });

  const match = histories.find(
    (row) =>
      phonesMatch(row.phone, normalized) &&
      row.user.role === "PATIENT" &&
      row.user.isActive,
  );
  return match?.user ?? null;
}
