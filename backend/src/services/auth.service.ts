import fs from "node:fs";
import path from "node:path";
import { Role, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { env } from "../config/env.js";
import {
  createRawToken,
  generateUniqueReference,
  hashPassword,
  hashToken,
  signAccessToken,
  toPrismaRole,
  toPublicUser,
  verifyPassword,
} from "./auth.helpers.js";
import { ensureDoctorProfileForUser } from "./doctor-profile.service.js";

const USER_PHOTO_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "user-photos");

export function getUserPhotoUploadRoot() {
  fs.mkdirSync(USER_PHOTO_UPLOAD_ROOT, { recursive: true });
  return USER_PHOTO_UPLOAD_ROOT;
}

function absoluteUserPhotoPath(stored: string) {
  const value = stored.trim().replace(/^\/uploads\/user-photos\//, "");
  if (!value || value.includes("..") || path.isAbsolute(value)) return null;
  return path.join(getUserPhotoUploadRoot(), value);
}

export async function signupUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: "patient" | "doctor";
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "An account with this email already exists");
  }

  const prismaRole = toPrismaRole(input.role);
  const reference = await generateUniqueReference(prismaRole);
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      fullName: input.fullName,
      passwordHash,
      role: prismaRole,
      reference,
      isActive: true,
    },
  });

  if (prismaRole === Role.DOCTOR) {
    await ensureDoctorProfileForUser(user.id);
  }

  const token = signAccessToken(user);
  return { user: toPublicUser(user), token };
}

export async function loginUser(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.role === Role.SUPER_ADMIN) {
    throw new AppError(401, "Invalid email or password");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid email or password");
  }

  if (!user.isActive) {
    throw new AppError(403, "This account has been deactivated. Contact support.");
  }

  const token = signAccessToken(user);
  return { user: toPublicUser(user), token };
}

export async function loginAdmin(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || user.role !== Role.SUPER_ADMIN) {
    throw new AppError(401, "Invalid admin email or password");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new AppError(401, "Invalid admin email or password");
  }

  if (!user.isActive) {
    throw new AppError(403, "This admin account has been deactivated.");
  }

  const token = signAccessToken(user);
  return { user: toPublicUser(user), token };
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });

  const generic = {
    message: "If that email exists, password reset instructions have been sent.",
  };

  if (!user || user.role === Role.SUPER_ADMIN) {
    return generic;
  }

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const rawToken = createRawToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt,
    },
  });

  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${rawToken}`;

  if (env.NODE_ENV !== "production") {
    console.log(`[dev] Password reset for ${email}: ${resetUrl}`);
    return {
      ...generic,
      resetToken: rawToken,
      resetUrl,
    };
  }

  return generic;
}

export async function resetPassword(input: { token: string; password: string }) {
  const tokenHash = hashToken(input.token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw new AppError(400, "Reset token is invalid or has expired");
  }

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { message: "Password updated successfully. You can sign in now." };
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(401, "User not found");
  }
  return toPublicUser(user);
}

export async function getAdminStats() {
  const [
    doctors,
    patients,
    activeDoctors,
    activePatients,
    inactiveDoctors,
    inactivePatients,
    voiceCalls,
    appointments,
    phoneBookings,
    activeSubscriptions,
  ] = await Promise.all([
    prisma.user.count({ where: { role: Role.DOCTOR } }),
    prisma.user.count({ where: { role: Role.PATIENT } }),
    prisma.user.count({ where: { role: Role.DOCTOR, isActive: true } }),
    prisma.user.count({ where: { role: Role.PATIENT, isActive: true } }),
    prisma.user.count({ where: { role: Role.DOCTOR, isActive: false } }),
    prisma.user.count({ where: { role: Role.PATIENT, isActive: false } }),
    prisma.voiceCall.count({
      where: {
        NOT: [
          { fromNumber: { contains: "1234567890" } },
          { fromNumber: { contains: "555555" } },
          { fromNumber: "" },
        ],
      },
    }),
    prisma.appointment.count(),
    prisma.voiceCall.count({ where: { appointmentId: { not: null } } }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
  ]);

  return {
    doctors,
    patients,
    activeDoctors,
    activePatients,
    inactiveDoctors,
    inactivePatients,
    voiceCalls,
    appointments,
    phoneBookings,
    activeSubscriptions,
  };
}

export async function listUsersByRole(input: {
  role: "doctor" | "patient";
  q?: string;
  status?: "active" | "inactive" | "all";
}) {
  const prismaRole = input.role === "doctor" ? Role.DOCTOR : Role.PATIENT;
  const where: Prisma.UserWhereInput = { role: prismaRole };

  if (input.status === "active") where.isActive = true;
  if (input.status === "inactive") where.isActive = false;

  if (input.q?.trim()) {
    const q = input.q.trim();
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { reference: { contains: q, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return users.map(toPublicUser);
}

export async function getManagedUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role === Role.SUPER_ADMIN) {
    throw new AppError(404, "User not found");
  }
  return toPublicUser(user);
}

export async function setUserActiveStatus(userId: string, isActive: boolean) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role === Role.SUPER_ADMIN) {
    throw new AppError(404, "User not found");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
  });

  return toPublicUser(updated);
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Account not found");
  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw new AppError(401, "Current password is incorrect");
  if (input.currentPassword === input.newPassword) {
    throw new AppError(400, "New password must be different from the current password");
  }
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  return { message: "Password updated." };
}

export async function updateOwnProfile(
  userId: string,
  input: { fullName?: string; phone?: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Account not found");

  const data: Prisma.UserUpdateInput = {};
  if (input.fullName !== undefined) {
    const fullName = input.fullName.trim().replace(/\s+/g, " ");
    if (fullName.length < 2) throw new AppError(400, "Full name must be at least 2 characters");
    data.fullName = fullName;
  }
  if (input.phone !== undefined) {
    const { normalizePhone } = await import("../utils/phone.js");
    const raw = String(input.phone).trim();
    const phone = raw ? normalizePhone(raw) : "";
    if (raw && phone.replace(/\D/g, "").length < 10) {
      throw new AppError(400, "Enter a valid phone number (at least 10 digits), or leave it blank");
    }
    data.phone = phone;
  }

  const updated = await prisma.user.update({ where: { id: userId }, data });
  return toPublicUser(updated);
}

export async function updateOwnPhoto(
  userId: string,
  file: { filename: string; path: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Account not found");

  const previous = absoluteUserPhotoPath(user.photoUrl || "");
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { photoUrl: file.filename },
  });
  if (previous && previous !== file.path) {
    fs.unlink(previous, () => undefined);
  }
  return toPublicUser(updated);
}

export async function removeOwnPhoto(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Account not found");

  const previous = absoluteUserPhotoPath(user.photoUrl || "");
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { photoUrl: "" },
  });
  if (previous) fs.unlink(previous, () => undefined);
  return toPublicUser(updated);
}

export async function listSystemUsers(input: {
  q?: string;
  status?: "active" | "inactive" | "all";
  role?: "all" | "doctor" | "patient" | "clinic_staff" | "admin";
}) {
  const where: Prisma.UserWhereInput = {};

  if (input.status === "active") where.isActive = true;
  if (input.status === "inactive") where.isActive = false;

  if (input.role === "doctor") where.role = Role.DOCTOR;
  else if (input.role === "patient") where.role = Role.PATIENT;
  else if (input.role === "clinic_staff") where.role = Role.CLINIC_STAFF;
  else if (input.role === "admin") where.role = Role.SUPER_ADMIN;

  if (input.q?.trim()) {
    const q = input.q.trim();
    where.OR = [
      { fullName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { reference: { contains: q, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ role: "asc" }, { createdAt: "desc" }],
    take: 500,
  });

  return users.map(toPublicUser);
}

/** Super Admin creates a doctor or patient account (no auto-login). */
export async function createManagedUser(input: {
  fullName: string;
  email: string;
  password: string;
  role: "patient" | "doctor";
}) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "An account with this email already exists");
  }

  const prismaRole = toPrismaRole(input.role);
  const reference = await generateUniqueReference(prismaRole);
  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      fullName: input.fullName.trim().replace(/\s+/g, " "),
      passwordHash,
      role: prismaRole,
      reference,
      isActive: true,
      phone: "",
    },
  });

  if (prismaRole === Role.DOCTOR) {
    await ensureDoctorProfileForUser(user.id);
  }

  return toPublicUser(user);
}
