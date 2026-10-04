import type { NextFunction, Request, Response } from "express";
import * as doctorDashboardService from "../services/doctor-dashboard.service.js";
import { AppError } from "../utils/AppError.js";

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const dashboard = await doctorDashboardService.getDoctorDashboard(req.user.sub);
    res.json({ success: true, dashboard });
  } catch (error) {
    next(error);
  }
}
