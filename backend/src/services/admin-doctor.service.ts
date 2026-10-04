import { Role, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { toPublicUser } from "./auth.helpers.js";
import { generateSlotsFromWeeklyHours } from "./doctor-availability.service.js";
import {
  toDoctorProfileDto,
  ensureDoctorProfileForUser,
  updateDoctorProfileForDoctor,
  type DoctorProfileDto,
  type UpdateDoctorProfileInput,
} from "./doctor-profile.service.js";

export type AdminDoctorListItem = ReturnType<typeof toPublicUser> & {
  specialty: string | null;
  clinic: string | null;
  fee: string | null;
  isVerified: boolean;
  verifiedAt: string | null;
};

export type AdminDoctorCrm = {
  user: ReturnType<typeof toPublicUser>;
  profile: DoctorProfileDto | null;
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

  const users = await prisma.user.findMany({
    where: { AND: and },
    include: {
      doctorProfile: {
        include: { specialty: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return users.map(
    (user): AdminDoctorListItem => ({
      ...toPublicUser(user),
      specialty: user.doctorProfile?.specialty.name ?? null,
      clinic: user.doctorProfile?.clinic ?? null,
      fee: user.doctorProfile?.fee ?? null,
      isVerified: user.doctorProfile?.isVerified ?? false,
      verifiedAt: user.doctorProfile?.verifiedAt?.toISOString() ?? null,
    }),
  );
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

  return {
    user: toPublicUser(withProfile),
    profile: toDoctorProfileDto(withProfile.doctorProfile),
  };
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
      weeks: 2,
      requireActive: false,
      allowEmpty: true,
    });
  }
  return getDoctorCrmForAdmin(userId);
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
