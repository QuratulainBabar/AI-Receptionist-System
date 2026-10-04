import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as messagesController from "../controllers/messages.controller.js";

export const messagesRouter = Router();

messagesRouter.use(authenticate, requireRole(Role.PATIENT));

messagesRouter.get("/", messagesController.list);
