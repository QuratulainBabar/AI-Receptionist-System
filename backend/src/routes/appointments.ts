import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as appointmentsController from "../controllers/appointments.controller.js";

export const appointmentsRouter = Router();

appointmentsRouter.use(authenticate, requireRole(Role.PATIENT));

appointmentsRouter.get("/", appointmentsController.list);
appointmentsRouter.post("/", appointmentsController.create);
appointmentsRouter.get("/:appointmentId", appointmentsController.getOne);
