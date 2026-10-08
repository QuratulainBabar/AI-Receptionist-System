import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { requireDoctorEnrollment } from "../middleware/enrollment.js";
import * as clinicSynthflowController from "../controllers/clinic-synthflow.controller.js";

export const doctorSynthflowRouter = Router();

doctorSynthflowRouter.use(authenticate, requireRole(Role.DOCTOR), requireDoctorEnrollment);

doctorSynthflowRouter.get("/", clinicSynthflowController.getSynthflowConfig);
doctorSynthflowRouter.put("/", clinicSynthflowController.updateSynthflowConfig);
doctorSynthflowRouter.post("/agent", clinicSynthflowController.createOrUpdateAgent);
doctorSynthflowRouter.post("/sync", clinicSynthflowController.syncDirectory);
