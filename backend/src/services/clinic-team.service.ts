import { Prisma, Role, type ClinicStaffRole, type ClinicMemberStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { generateUniqueReference, hashPassword } from "./auth.helpers.js";
import {
  STAFF_ROLE_OPTIONS,
  normalizePermissions,
  permissionLabel,
  CLINIC_PERMISSION_KEYS,
  type ClinicPermissions,
} from "./clinic-team.permissions.js";

export type PublicTeamMember = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  reference: string;
  staffRole: ClinicStaffRole;
  staffRoleLabel: string;
  status: "active" | "inactive";
  permissions: ClinicPermissions;
  dateAdded: string;
  createdAt: string;
};

function roleLabel(role: ClinicStaffRole) {
  return STAFF_ROLE_OPTIONS.find((r) => r.id === role)?.label || role;
}

function toPublic(row: {
  id: string;
  staffRole: ClinicStaffRole;
  status: ClinicMemberStatus;
  permissions: Prisma.JsonValue;
  createdAt: Date;
  memberUser: {
    id: string;
    fullName: string;
    email: string;
    reference: string;
    isActive: boolean;
  };
}): PublicTeamMember {
  const permissions = normalizePermissions(
    row.staffRole,
    row.permissions as Partial<ClinicPermissions>,
  );
  const active = row.status === "ACTIVE" && row.memberUser.isActive;
  return {
    id: row.id,
    userId: row.memberUser.id,
    fullName: row.memberUser.fullName,
    email: row.memberUser.email,
    reference: row.memberUser.reference,
    staffRole: row.staffRole,
    staffRoleLabel: roleLabel(row.staffRole),
    status: active ? "active" : "inactive",
    permissions,
    dateAdded: row.createdAt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    createdAt: row.createdAt.toISOString(),
  };
}

async function requireOwnerDoctor(ownerDoctorUserId: string) {
  const doctor = await prisma.user.findUnique({ where: { id: ownerDoctorUserId } });
  if (!doctor || doctor.role !== Role.DOCTOR || !doctor.isActive) {
    throw new AppError(403, "Only an active clinic doctor can manage team members.");
  }
  return doctor;
}

export function listRoleOptions() {
  return STAFF_ROLE_OPTIONS.map((role) => ({
    ...role,
    defaultPermissions: normalizePermissions(role.id),
    permissionLabels: Object.fromEntries(
      CLINIC_PERMISSION_KEYS.map((key) => [key, permissionLabel(key)]),
    ) as Record<keyof ClinicPermissions, string>,
  }));
}

export async function listTeamMembersForDoctor(
  ownerDoctorUserId: string,
  filters?: { q?: string; role?: ClinicStaffRole | "all"; status?: "all" | "active" | "inactive" },
) {
  await requireOwnerDoctor(ownerDoctorUserId);

  const rows = await prisma.clinicTeamMember.findMany({
    where: {
      ownerDoctorUserId,
      ...(filters?.role && filters.role !== "all" ? { staffRole: filters.role } : {}),
    },
    include: { memberUser: true },
    orderBy: { createdAt: "desc" },
  });

  let members = rows.map(toPublic);

  if (filters?.status && filters.status !== "all") {
    members = members.filter((m) => m.status === filters.status);
  }

  if (filters?.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    members = members.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.reference.toLowerCase().includes(q) ||
        m.staffRoleLabel.toLowerCase().includes(q),
    );
  }

  return members;
}

export async function getTeamMemberForDoctor(ownerDoctorUserId: string, memberId: string) {
  await requireOwnerDoctor(ownerDoctorUserId);
  const row = await prisma.clinicTeamMember.findFirst({
    where: { id: memberId, ownerDoctorUserId },
    include: { memberUser: true },
  });
  if (!row) throw new AppError(404, "Team member not found");
  return toPublic(row);
}

export async function createTeamMemberForDoctor(
  ownerDoctorUserId: string,
  input: {
    fullName: string;
    email: string;
    password: string;
    staffRole: ClinicStaffRole;
    permissions?: Partial<ClinicPermissions>;
    status?: "active" | "inactive";
  },
) {
  await requireOwnerDoctor(ownerDoctorUserId);

  const fullName = String(input.fullName || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (fullName.length < 2) throw new AppError(400, "Enter the team member's full name.");
  if (!email.includes("@")) throw new AppError(400, "Enter a valid email address.");
  if (password.length < 8) throw new AppError(400, "Password must be at least 8 characters.");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(409, "An account with this email already exists.");
  }

  const permissions = normalizePermissions(input.staffRole, input.permissions);
  const status: ClinicMemberStatus = input.status === "inactive" ? "INACTIVE" : "ACTIVE";
  const passwordHash = await hashPassword(password);
  const reference = await generateUniqueReference(Role.CLINIC_STAFF);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        fullName,
        passwordHash,
        role: Role.CLINIC_STAFF,
        reference,
        isActive: status === "ACTIVE",
      },
    });

    const membership = await tx.clinicTeamMember.create({
      data: {
        ownerDoctorUserId,
        memberUserId: user.id,
        staffRole: input.staffRole,
        status,
        permissions: permissions as unknown as Prisma.InputJsonValue,
      },
      include: { memberUser: true },
    });

    return membership;
  });

  return toPublic(created);
}

export async function updateTeamMemberForDoctor(
  ownerDoctorUserId: string,
  memberId: string,
  input: {
    fullName?: string;
    staffRole?: ClinicStaffRole;
    permissions?: Partial<ClinicPermissions>;
    status?: "active" | "inactive";
    password?: string;
  },
) {
  await requireOwnerDoctor(ownerDoctorUserId);

  const existing = await prisma.clinicTeamMember.findFirst({
    where: { id: memberId, ownerDoctorUserId },
    include: { memberUser: true },
  });
  if (!existing) throw new AppError(404, "Team member not found");

  const staffRole = input.staffRole || existing.staffRole;
  const permissions = normalizePermissions(
    staffRole,
    input.permissions ?? (existing.permissions as Partial<ClinicPermissions>),
  );
  const status: ClinicMemberStatus | undefined =
    input.status === undefined
      ? undefined
      : input.status === "inactive"
        ? "INACTIVE"
        : "ACTIVE";

  const passwordHash =
    input.password && input.password.length >= 8 ? await hashPassword(input.password) : undefined;
  if (input.password && input.password.length > 0 && input.password.length < 8) {
    throw new AppError(400, "Password must be at least 8 characters.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.memberUserId },
      data: {
        ...(input.fullName !== undefined ? { fullName: String(input.fullName).trim() } : {}),
        ...(status !== undefined ? { isActive: status === "ACTIVE" } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
    });

    return tx.clinicTeamMember.update({
      where: { id: existing.id },
      data: {
        staffRole,
        permissions: permissions as unknown as Prisma.InputJsonValue,
        ...(status !== undefined ? { status } : {}),
      },
      include: { memberUser: true },
    });
  });

  return toPublic(updated);
}

export async function removeTeamMemberForDoctor(ownerDoctorUserId: string, memberId: string) {
  await requireOwnerDoctor(ownerDoctorUserId);

  const existing = await prisma.clinicTeamMember.findFirst({
    where: { id: memberId, ownerDoctorUserId },
  });
  if (!existing) throw new AppError(404, "Team member not found");

  await prisma.$transaction(async (tx) => {
    await tx.clinicTeamMember.delete({ where: { id: existing.id } });
    await tx.user.delete({ where: { id: existing.memberUserId } });
  });

  return { id: memberId };
}

export async function findActiveMembershipForUser(memberUserId: string) {
  return prisma.clinicTeamMember.findUnique({
    where: { memberUserId },
    include: { ownerDoctor: true, memberUser: true },
  });
}
