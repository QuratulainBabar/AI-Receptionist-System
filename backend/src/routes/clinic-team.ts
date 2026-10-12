import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  attachClinicContext,
  requireClinicPermission,
} from "../middleware/clinic-context.js";
import { requireDoctorEnrollment } from "../middleware/enrollment.js";
import * as clinicTeamController from "../controllers/clinic-team.controller.js";

export const clinicTeamRouter = Router();

clinicTeamRouter.use(
  authenticate,
  requireRole(Role.DOCTOR, Role.CLINIC_STAFF),
  attachClinicContext,
  requireDoctorEnrollment,
  requireClinicPermission("teamMembers"),
);

clinicTeamRouter.get("/roles", clinicTeamController.listRoles);
clinicTeamRouter.get("/", clinicTeamController.list);
clinicTeamRouter.get("/:memberId", clinicTeamController.getOne);
clinicTeamRouter.post("/", clinicTeamController.create);
clinicTeamRouter.put("/:memberId", clinicTeamController.update);
clinicTeamRouter.delete("/:memberId", clinicTeamController.remove);
