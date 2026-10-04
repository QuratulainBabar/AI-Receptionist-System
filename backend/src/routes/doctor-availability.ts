import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as doctorAvailabilityController from "../controllers/doctor-availability.controller.js";

export const doctorAvailabilityRouter = Router();

doctorAvailabilityRouter.use(authenticate, requireRole(Role.DOCTOR));

doctorAvailabilityRouter.get("/", doctorAvailabilityController.list);
doctorAvailabilityRouter.post("/", doctorAvailabilityController.create);
doctorAvailabilityRouter.post("/generate", doctorAvailabilityController.generate);
doctorAvailabilityRouter.put("/:slotId", doctorAvailabilityController.update);
doctorAvailabilityRouter.delete("/:slotId", doctorAvailabilityController.remove);
