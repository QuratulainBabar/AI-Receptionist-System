import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { ClinicStaffRole } from "@prisma/client";
import * as clinicTeamService from "../services/clinic-team.service.js";
import { CLINIC_PERMISSION_KEYS } from "../services/clinic-team.permissions.js";
import { AppError } from "../utils/AppError.js";

const permissionsSchema = z
  .object(
    Object.fromEntries(CLINIC_PERMISSION_KEYS.map((key) => [key, z.boolean().optional()])) as Record<
      (typeof CLINIC_PERMISSION_KEYS)[number],
      z.ZodOptional<z.ZodBoolean>
    >,
  )
  .partial()
  .optional();

const createBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(120),
  staffRole: z.nativeEnum(ClinicStaffRole),
  permissions: permissionsSchema,
  status: z.enum(["active", "inactive"]).optional(),
});

const updateBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(8).max(120).optional(),
  staffRole: z.nativeEnum(ClinicStaffRole).optional(),
  permissions: permissionsSchema,
  status: z.enum(["active", "inactive"]).optional(),
});

function ownerId(req: Request) {
  return req.clinicContext?.ownerDoctorUserId || req.user?.sub || "";
}

export async function listRoles(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, roles: clinicTeamService.listRoleOptions() });
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!ownerId(req)) throw new AppError(401, "Authentication required");
    const q = typeof req.query.q === "string" ? req.query.q : undefined;
    const role =
      typeof req.query.role === "string" && req.query.role !== "all"
        ? (req.query.role as ClinicStaffRole)
        : "all";
    const status =
      typeof req.query.status === "string" &&
      (req.query.status === "active" || req.query.status === "inactive")
        ? req.query.status
        : "all";
    const members = await clinicTeamService.listTeamMembersForDoctor(ownerId(req), {
      q,
      role,
      status,
    });
    res.json({ success: true, members });
  } catch (error) {
    next(error);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    if (!ownerId(req)) throw new AppError(401, "Authentication required");
    const member = await clinicTeamService.getTeamMemberForDoctor(
      ownerId(req),
      String(req.params.memberId),
    );
    res.json({ success: true, member });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!ownerId(req)) throw new AppError(401, "Authentication required");
    const body = createBodySchema.parse(req.body ?? {});
    const member = await clinicTeamService.createTeamMemberForDoctor(ownerId(req), body);
    res.status(201).json({
      success: true,
      member,
      message: "Team member added. They can sign in with the email and password you set.",
    });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    if (!ownerId(req)) throw new AppError(401, "Authentication required");
    const body = updateBodySchema.parse(req.body ?? {});
    const member = await clinicTeamService.updateTeamMemberForDoctor(
      ownerId(req),
      String(req.params.memberId),
      body,
    );
    res.json({ success: true, member, message: "Team member updated." });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!ownerId(req)) throw new AppError(401, "Authentication required");
    const result = await clinicTeamService.removeTeamMemberForDoctor(
      ownerId(req),
      String(req.params.memberId),
    );
    res.json({ success: true, ...result, message: "Team member removed." });
  } catch (error) {
    next(error);
  }
}
