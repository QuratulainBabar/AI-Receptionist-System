import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as doctorAvailabilityService from "../services/doctor-availability.service.js";
import { AppError } from "../utils/AppError.js";

const createBodySchema = z.object({
  startsAt: z.string().trim().min(1),
});

const updateBodySchema = z.object({
  startsAt: z.string().trim().min(1),
});

const generateBodySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(8).optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const from = typeof req.query.from === "string" ? req.query.from : undefined;
    const to = typeof req.query.to === "string" ? req.query.to : undefined;
    const includeBooked =
      req.query.includeBooked === undefined
        ? true
        : String(req.query.includeBooked).toLowerCase() !== "false";
    const slots = await doctorAvailabilityService.listSlotsForDoctor(req.user.sub, {
      from,
      to,
      includeBooked,
    });
    res.json({ success: true, slots });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const body = createBodySchema.parse(req.body ?? {});
    const slot = await doctorAvailabilityService.createSlotForDoctor(req.user.sub, body.startsAt);
    res.status(201).json({ success: true, slot, message: "Availability slot created." });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const slotId = String(req.params.slotId);
    const body = updateBodySchema.parse(req.body ?? {});
    const slot = await doctorAvailabilityService.updateSlotForDoctor(
      req.user.sub,
      slotId,
      body.startsAt,
    );
    res.json({ success: true, slot, message: "Availability slot updated." });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const slotId = String(req.params.slotId);
    const result = await doctorAvailabilityService.deleteSlotForDoctor(req.user.sub, slotId);
    res.json({ success: true, ...result, message: "Availability slot removed." });
  } catch (error) {
    next(error);
  }
}

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const body = generateBodySchema.parse(req.body ?? {});
    const result = await doctorAvailabilityService.generateSlotsFromWeeklyHours(
      req.user.sub,
      body,
    );
    res.json({
      success: true,
      ...result,
      message: `Created ${result.created} open slot${result.created === 1 ? "" : "s"} from weekly hours.`,
    });
  } catch (error) {
    next(error);
  }
}
