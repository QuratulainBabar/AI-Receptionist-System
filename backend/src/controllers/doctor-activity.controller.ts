import type { NextFunction, Request, Response } from "express";
import * as doctorActivityService from "../services/doctor-activity.service.js";
import { AppError } from "../utils/AppError.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const activities = await doctorActivityService.listActivitiesForDoctor(req.user.sub);
    res.json({ success: true, activities });
  } catch (error) {
    next(error);
  }
}
