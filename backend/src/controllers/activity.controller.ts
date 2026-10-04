import type { NextFunction, Request, Response } from "express";
import * as activityService from "../services/activity.service.js";
import { AppError } from "../utils/AppError.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const activities = await activityService.listActivitiesForPatient(req.user.sub);
    res.json({ success: true, activities });
  } catch (error) {
    next(error);
  }
}
