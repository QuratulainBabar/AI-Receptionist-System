import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "./auth.helpers.js";

export const DEMO_DOCTOR_EMAIL = "doctor@example.com";

const DEMO_DOCTOR = {
  email: DEMO_DOCTOR_EMAIL,
  password: "Doctor123",
  fullName: "Dr. Daniel Osei",
  reference: "DR-1042",
} as const;

const DEMO_ADMIN = {
  email: "admin@example.com",
  password: "Admin123",
  fullName: "Super Admin",
  reference: "SA-1001",
} as const;

/** Demo patient stays removed while the patient portal is paused. */
const REMOVE_DEMO_EMAILS = ["patient@example.com"] as const;

/**
 * Keep the published demo doctor + super admin logins working on every boot.
 * Removes the paused patient demo. Real doctor accounts are left untouched.
 */
export async function ensureDemoAccounts() {
  const doctorHash = await hashPassword(DEMO_DOCTOR.password);
  const adminHash = await hashPassword(DEMO_ADMIN.password);

  await prisma.specialty.upsert({
    where: { id: "cardiology" },
    update: {},
    create: {
      id: "cardiology",
      name: "Cardiologist",
      description: "Heart, blood pressure and circulation",
      sortOrder: 2,
    },
  });

  const doctor = await prisma.user.upsert({
    where: { email: DEMO_DOCTOR.email },
    update: {
      passwordHash: doctorHash,
      role: Role.DOCTOR,
      reference: DEMO_DOCTOR.reference,
      isActive: true,
      fullName: DEMO_DOCTOR.fullName,
    },
    create: {
      email: DEMO_DOCTOR.email,
      passwordHash: doctorHash,
      role: Role.DOCTOR,
      reference: DEMO_DOCTOR.reference,
      isActive: true,
      fullName: DEMO_DOCTOR.fullName,
    },
  });

  await prisma.doctorProfile.upsert({
    where: { userId: doctor.id },
    update: {
      specialtyId: "cardiology",
      clinic: "Northgate Medical Centre",
      fee: "$60",
      about:
        "Consultant cardiologist focused on hypertension, arrhythmia and preventive heart care for adults.",
    },
    create: {
      userId: doctor.id,
      specialtyId: "cardiology",
      experienceYears: 12,
      rating: 4.9,
      reviews: 128,
      clinic: "Northgate Medical Centre",
      fee: "$60",
      languages: ["English", "French"],
      about:
        "Consultant cardiologist focused on hypertension, arrhythmia and preventive heart care for adults.",
    },
  });

  await prisma.user.upsert({
    where: { email: DEMO_ADMIN.email },
    update: {
      passwordHash: adminHash,
      role: Role.SUPER_ADMIN,
      reference: DEMO_ADMIN.reference,
      isActive: true,
      fullName: DEMO_ADMIN.fullName,
    },
    create: {
      email: DEMO_ADMIN.email,
      passwordHash: adminHash,
      role: Role.SUPER_ADMIN,
      reference: DEMO_ADMIN.reference,
      isActive: true,
      fullName: DEMO_ADMIN.fullName,
    },
  });

  const removedDemo = await prisma.user.deleteMany({
    where: { email: { in: [...REMOVE_DEMO_EMAILS] } },
  });

  console.log(
    `[auth] Demo accounts ready: ${DEMO_DOCTOR.email} / ${DEMO_DOCTOR.password}, ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}` +
      ` (removed ${removedDemo.count} patient demo)`,
  );
}
