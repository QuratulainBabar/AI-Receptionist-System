import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  allPermissions,
  type ClinicPermissionKey,
  type ClinicPermissions,
  normalizePermissions,
} from "../services/clinic-team.permissions.js";

export type ClinicContext = {
  actorUserId: string;
  ownerDoctorUserId: string;
  isOwner: boolean;
  staffRole: string | null;
  permissions: ClinicPermissions;
};

declare global {
  namespace Express {
    interface Request {
      clinicContext?: ClinicContext;
    }
  }
}

export async function attachClinicContext(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }

    if (req.user.role === Role.DOCTOR) {
      req.clinicContext = {
        actorUserId: req.user.sub,
        ownerDoctorUserId: req.user.sub,
        isOwner: true,
        staffRole: null,
        permissions: allPermissions(),
      };
      return next();
    }

    if (req.user.role !== Role.CLINIC_STAFF) {
      throw new AppError(403, "You do not have permission for this resource");
    }

    const membership = await prisma.clinicTeamMember.findUnique({
      where: { memberUserId: req.user.sub },
      include: { memberUser: true, ownerDoctor: true },
    });

    if (!membership || membership.status !== "ACTIVE" || !membership.memberUser.isActive) {
      throw new AppError(403, "Your clinic team access is inactive. Contact the clinic doctor.");
    }
    if (!membership.ownerDoctor.isActive) {
      throw new AppError(403, "This clinic account is inactive.");
    }

    const permissions = normalizePermissions(
      membership.staffRole,
      membership.permissions as Partial<ClinicPermissions>,
    );

    req.clinicContext = {
      actorUserId: req.user.sub,
      ownerDoctorUserId: membership.ownerDoctorUserId,
      isOwner: false,
      staffRole: membership.staffRole,
      permissions,
    };

    // Scope clinic data queries to the owning doctor without rewriting every service call.
    req.user = {
      ...req.user,
      sub: membership.ownerDoctorUserId,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireClinicOwner(req: Request, _res: Response, next: NextFunction) {
  if (!req.clinicContext?.isOwner) {
    return next(new AppError(403, "Only the clinic doctor can manage team members."));
  }
  return next();
}

export function requireClinicPermission(...keys: ClinicPermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.clinicContext) {
      return next(new AppError(401, "Authentication required"));
    }
    if (req.clinicContext.isOwner) return next();
    const ok = keys.some((key) => req.clinicContext!.permissions[key]);
    if (!ok) {
      return next(new AppError(403, "You do not have permission for this action."));
    }
    return next();
  };
}

export function clinicActorUserId(req: Request) {
  return req.clinicContext?.actorUserId || req.user?.sub || "";
}
