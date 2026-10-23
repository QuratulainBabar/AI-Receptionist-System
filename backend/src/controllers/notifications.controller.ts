import type { NextFunction, Request, Response } from "express";
import * as notificationsService from "../services/notifications.service.js";
import { AppError } from "../utils/AppError.js";

export async function listForDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const notifications = await notificationsService.listNotificationsForDoctor(req.user.sub);
    res.json({ success: true, notifications });
  } catch (error) {
    next(error);
  }
}

export async function markAllReadForDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const result = await notificationsService.markAllNotificationsReadForDoctor(req.user.sub);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function markOneReadForDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
    if (!id) throw new AppError(400, "Notification id is required");
    const result = await notificationsService.markNotificationReadForDoctor(req.user.sub, id);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}
