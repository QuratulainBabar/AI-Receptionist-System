import { prisma } from "../lib/prisma.js";
import { normalizePhone, phonesMatch } from "../utils/phone.js";

export async function findPatientByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const histories = await prisma.patientMedicalHistory.findMany({
    where: { phone: { not: "" } },
    include: { user: true },
    take: 500,
  });

  const match = histories.find((row) => phonesMatch(row.phone, normalized));
  if (!match || match.user.role !== "PATIENT" || !match.user.isActive) return null;
  return match.user;
}
