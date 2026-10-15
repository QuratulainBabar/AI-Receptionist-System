import { Role, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { toPublicUser } from "./auth.helpers.js";
import { generateSlotsFromWeeklyHours } from "./doctor-availability.service.js";
import { queueDirectorySync } from "./clinic-synthflow.service.js";
import {
  toDoctorProfileDto,
  ensureDoctorProfileForUser,
  updateDoctorProfileForDoctor,
  updateDoctorPhotoForDoctor,
  type DoctorProfileDto,
  type UpdateDoctorProfileInput,
} from "./doctor-profile.service.js";
import { generateUniqueReference, hashPassword } from "./auth.helpers.js";

import { getCurrentSubscriptionForUser, latestSubscriptionByUserIds } from "./subscription.service.js";

export type AdminDoctorListItem = Omit<ReturnType<typeof toPublicUser>, "phone"> & {
  specialty: string | null;
  clinic: string | null;
  fee: string | null;
  phone: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
  subscriptionStatus: string | null;
  subscriptionPlanName: string | null;
  totalAppointments: number;
  upcomingAppointments: number;
};

export type AdminDoctorListSummary = {
  total: number;
  active: number;
  inactive: number;
};

export type AdminDoctorCrm = {
  user: ReturnType<typeof toPublicUser>;
  profile: DoctorProfileDto | null;
  subscription: Awaited<ReturnType<typeof getCurrentSubscriptionForUser>>;
  totalAppointments: number;
  upcomingAppointments: number;
};

export async function listDoctorsForAdmin(input: {
  q?: string;
  status?: "active" | "inactive" | "all";
  verification?: "verified" | "unverified" | "all";
}) {
  const and: Prisma.UserWhereInput[] = [{ role: Role.DOCTOR }];

  if (input.status === "active") and.push({ isActive: true });
  if (input.status === "inactive") and.push({ isActive: false });

  if (input.verification === "verified") {
    and.push({ doctorProfile: { isVerified: true } });
  } else if (input.verification === "unverified") {
    and.push({
      OR: [{ doctorProfile: null }, { doctorProfile: { isVerified: false } }],
    });
  }

  if (input.q?.trim()) {
    const q = input.q.trim();
    and.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
        { doctorProfile: { clinic: { contains: q, mode: "insensitive" } } },
        { doctorProfile: { specialty: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  const [users, summaryRows] = await Promise.all([
    prisma.user.findMany({
      where: { AND: and },
      include: {
        doctorProfile: {
          include: { specialty: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.groupBy({
      by: ["isActive"],
      where: { role: Role.DOCTOR },
      _count: { _all: true },
    }),
  ]);

  const doctorIds = users.map((user) => user.id);
  const now = new Date();
  const [subscriptions, appointmentGroups, upcomingGroups] = await Promise.all([
    latestSubscriptionByUserIds(doctorIds),
    doctorIds.length
      ? prisma.appointment.groupBy({
          by: ["doctorUserId"],
          where: { doctorUserId: { in: doctorIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    doctorIds.length
      ? prisma.appointment.groupBy({
          by: ["doctorUserId"],
          where: {
            doctorUserId: { in: doctorIds },
            startsAt: { gte: now },
            status: { in: ["PENDING", "CONFIRMED"] },
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  const totalByDoctor = new Map(appointmentGroups.map((row) => [row.doctorUserId, row._count._all]));
  const upcomingByDoctor = new Map(upcomingGroups.map((row) => [row.doctorUserId, row._count._all]));

  let active = 0;
  let inactive = 0;
  for (const row of summaryRows) {
    if (row.isActive) active = row._count._all;
    else inactive = row._count._all;
  }
  const summary: AdminDoctorListSummary = {
    total: active + inactive,
    active,
    inactive,
  };

  const items = users.map((user): AdminDoctorListItem => {
    const subscription = subscriptions.get(user.id);
    const specialtyName = user.doctorProfile?.specialty.name?.trim() || "";
    return {
      ...toPublicUser(user),
      specialty:
        user.doctorProfile?.specialtyId === "unspecified" || !specialtyName ? null : specialtyName,
      clinic: user.doctorProfile?.clinic?.trim() || null,
      fee: user.doctorProfile?.fee?.trim() || null,
      phone: user.doctorProfile?.phone?.trim() || null,
      isVerified: user.doctorProfile?.isVerified ?? false,
      verifiedAt: user.doctorProfile?.verifiedAt?.toISOString() ?? null,
      subscriptionStatus: subscription?.statusLabel ?? null,
      subscriptionPlanName: subscription?.planName ?? null,
      totalAppointments: totalByDoctor.get(user.id) ?? 0,
      upcomingAppointments: upcomingByDoctor.get(user.id) ?? 0,
    };
  });

  return { users: items, summary };
}

export async function getDoctorCrmForAdmin(userId: string): Promise<AdminDoctorCrm> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== Role.DOCTOR) {
    throw new AppError(404, "Doctor not found");
  }

  await ensureDoctorProfileForUser(userId);

  const withProfile = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      doctorProfile: {
        include: {
          user: true,
          specialty: true,
        },
      },
    },
  });

  if (!withProfile?.doctorProfile) {
    throw new AppError(404, "Doctor profile not found");
  }

  const now = new Date();
  const [subscription, totalAppointments, upcomingAppointments] = await Promise.all([
    getCurrentSubscriptionForUser(userId),
    prisma.appointment.count({ where: { doctorUserId: userId } }),
    prisma.appointment.count({
      where: {
        doctorUserId: userId,
        startsAt: { gte: now },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    }),
  ]);

  return {
    user: toPublicUser(withProfile),
    profile: toDoctorProfileDto(withProfile.doctorProfile),
    subscription,
    totalAppointments,
    upcomingAppointments,
  };
}

export async function createDoctorForAdmin(input: {
  fullName: string;
  email: string;
  password: string;
  isActive?: boolean;
  phone?: string;
  isVerified?: boolean;
  verificationNote?: string;
  adminUserId?: string;
  profile?: UpdateDoctorProfileInput;
}): Promise<AdminDoctorCrm> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (fullName.length < 2) throw new AppError(400, "Full name must be at least 2 characters");
  if (input.password.length < 8) throw new AppError(400, "Password must be at least 8 characters");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new AppError(409, "An account with this email already exists");

  const reference = await generateUniqueReference(Role.DOCTOR);
  const passwordHash = await hashPassword(input.password);
  const phone = (input.phone || input.profile?.phone || "").trim();

  const user = await prisma.user.create({
    data: {
      email,
      fullName,
      passwordHash,
      role: Role.DOCTOR,
      reference,
      isActive: input.isActive !== false,
      phone,
    },
  });

  await ensureDoctorProfileForUser(user.id);

  const profileInput: UpdateDoctorProfileInput = {
    ...(input.profile || {}),
    fullName,
    phone: phone || input.profile?.phone,
  };
  await updateDoctorProfileForDoctor(user.id, profileInput, { requireActive: false });

  if (input.profile?.weeklyHours !== undefined) {
    await generateSlotsFromWeeklyHours(user.id, {
      weeks: 1,
      requireActive: false,
      allowEmpty: true,
    });
  }

  if (input.isVerified) {
    await prisma.doctorProfile.update({
      where: { userId: user.id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        verifiedByAdminId: input.adminUserId || null,
        verificationNote: input.verificationNote?.trim() || "",
      },
    });
  }

  queueDirectorySync("admin-create-doctor");
  return getDoctorCrmForAdmin(user.id);
}

export async function uploadDoctorPhotoForAdmin(
  userId: string,
  file: { filename: string; path: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== Role.DOCTOR) throw new AppError(404, "Doctor not found");
  await ensureDoctorProfileForUser(userId);
  const profile = await updateDoctorPhotoForDoctor(userId, file);
  queueDirectorySync("admin-doctor-photo");
  return profile;
}

export async function updateDoctorCrmForAdmin(
  userId: string,
  input: UpdateDoctorProfileInput,
): Promise<AdminDoctorCrm> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { doctorProfile: true },
  });
  if (!user || user.role !== Role.DOCTOR) {
    throw new AppError(404, "Doctor not found");
  }

  await ensureDoctorProfileForUser(userId);

  // Reuse the same field validation/update path as the doctor portal.
  await updateDoctorProfileForDoctor(userId, input, { requireActive: false });
  if (input.weeklyHours !== undefined) {
    await generateSlotsFromWeeklyHours(userId, {
      weeks: 1,
      requireActive: false,
      allowEmpty: true,
    });
  }
  queueDirectorySync("admin-crm-save");
  return getDoctorCrmForAdmin(userId);
}

/** Permanently remove a doctor account and related clinic data. */
export async function deleteDoctorForAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      doctorProfile: { select: { id: true } },
      subscriptions: {
        where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
        select: { stripeSubscriptionId: true },
      },
    },
  });
  if (!user || user.role !== Role.DOCTOR) {
    throw new AppError(404, "Doctor not found");
  }

  // Best-effort: cancel active Stripe subscriptions so billing stops.
  if (user.subscriptions.length) {
    try {
      const { getStripe, isStripeConfigured } = await import("../lib/stripe.js");
      if (isStripeConfigured()) {
        const stripe = getStripe();
        for (const sub of user.subscriptions) {
          if (!sub.stripeSubscriptionId) continue;
          await stripe.subscriptions.cancel(sub.stripeSubscriptionId).catch(() => undefined);
        }
      }
    } catch {
      // Local delete still proceeds if Stripe cancel fails.
    }
  }

  await prisma.$transaction(async (tx) => {
    // Appointments reference availability slots with Restrict — clear them first.
    await tx.appointment.deleteMany({ where: { doctorUserId: userId } });

    // Clinic staff memberships owned by this doctor (member users are left intact).
    await tx.clinicTeamMember.deleteMany({ where: { ownerDoctorUserId: userId } });

    await tx.user.delete({ where: { id: userId } });
  });

  queueDirectorySync("admin-doctor-delete");
  return { id: user.id, fullName: user.fullName, email: user.email };
}

export async function setDoctorVerificationForAdmin(input: {
  userId: string;
  isVerified: boolean;
  verificationNote?: string;
  adminUserId: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { doctorProfile: true },
  });
  if (!user || user.role !== Role.DOCTOR) {
    throw new AppError(404, "Doctor not found");
  }

  await ensureDoctorProfileForUser(input.userId);

  await prisma.doctorProfile.update({
    where: { userId: input.userId },
    data: {
      isVerified: input.isVerified,
      verifiedAt: input.isVerified ? new Date() : null,
      verifiedByAdminId: input.isVerified ? input.adminUserId : null,
      verificationNote: input.verificationNote?.trim() || "",
    },
  });

  return getDoctorCrmForAdmin(input.userId);
}
