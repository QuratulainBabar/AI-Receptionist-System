import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as doctorAvailabilityService from "../services/doctor-availability.service.js";
import { syncPromptAfterAvailabilityChange } from "../services/clinic-synthflow.service.js";
import { AppError } from "../utils/AppError.js";

const createBodySchema = z.object({
  startsAt: z.string().trim().min(1),
});

const createRangeBodySchema = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().trim().min(1).max(16),
  endTime: z.string().trim().min(1).max(16),
  durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]).optional(),
});

const updateBodySchema = z.object({
  startsAt: z.string().trim().min(1),
});

const generateBodySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(8).optional(),
  replaceOpen: z.boolean().optional(),
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
    res.json({ success: true, slots, ...doctorAvailabilityService.clinicClock() });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const body = createBodySchema.parse(req.body ?? {});
    const slot = await doctorAvailabilityService.createSlotForDoctor(req.user.sub, body.startsAt);
    const sync = await syncPromptAfterAvailabilityChange("doctor-create-slot");
    res.status(201).json({
      success: true,
      slot,
      message: sync.synced
        ? "Availability slot created and system prompt updated."
        : "Availability slot created.",
      synthflowSynced: sync.synced,
      openSlotsSummary: sync.openSlotsSummary,
      warning: sync.warning,
    });
  } catch (error) {
    next(error);
  }
}

export async function createRange(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const body = createRangeBodySchema.parse(req.body ?? {});
    const result = await doctorAvailabilityService.createSlotsFromRangeForDoctor(req.user.sub, body);
    const sync = await syncPromptAfterAvailabilityChange("doctor-create-slot-range");
    res.status(201).json({
      success: true,
      ...result,
      message: sync.synced
        ? `Created ${result.created} slot${result.created === 1 ? "" : "s"} and updated the system prompt.`
        : `Created ${result.created} slot${result.created === 1 ? "" : "s"}.`,
      synthflowSynced: sync.synced,
      openSlotsSummary: sync.openSlotsSummary,
      warning: sync.warning,
    });
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
    const sync = await syncPromptAfterAvailabilityChange("doctor-update-slot");
    res.json({
      success: true,
      slot,
      message: sync.synced
        ? "Availability slot updated and system prompt updated."
        : "Availability slot updated.",
      synthflowSynced: sync.synced,
      openSlotsSummary: sync.openSlotsSummary,
      warning: sync.warning,
    });
  } catch (error) {
    next(error);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const slotId = String(req.params.slotId);
    const result = await doctorAvailabilityService.deleteSlotForDoctor(req.user.sub, slotId);
    const sync = await syncPromptAfterAvailabilityChange("doctor-remove-slot");
    res.json({
      success: true,
      ...result,
      message: sync.synced
        ? "Availability slot removed and system prompt updated."
        : "Availability slot removed.",
      synthflowSynced: sync.synced,
      openSlotsSummary: sync.openSlotsSummary,
      warning: sync.warning,
    });
  } catch (error) {
    next(error);
  }
}

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) throw new AppError(401, "Authentication required");
    const body = generateBodySchema.parse(req.body ?? {});
    const result = await doctorAvailabilityService.generateSlotsFromWeeklyHours(req.user.sub, {
      weeks: body.weeks,
      replaceOpen: body.replaceOpen ?? true,
    });
    const sync = await syncPromptAfterAvailabilityChange("doctor-generate-slots");
    res.json({
      success: true,
      ...result,
      message: sync.synced
        ? `Created ${result.created} open slot${result.created === 1 ? "" : "s"} and updated the system prompt.`
        : `Created ${result.created} open slot${result.created === 1 ? "" : "s"} from weekly hours.`,
      synthflowSynced: sync.synced,
      openSlotsSummary: sync.openSlotsSummary,
      warning: sync.warning,
    });
  } catch (error) {
    next(error);
  }
}
