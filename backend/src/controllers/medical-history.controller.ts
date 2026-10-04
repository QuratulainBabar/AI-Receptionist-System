import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as medicalHistoryService from "../services/medical-history.service.js";
import { AppError } from "../utils/AppError.js";

const listField = z.array(z.string()).default([]);

const upsertBodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  age: z.number().int().min(0).max(130).nullable(),
  bloodGroup: z.string().trim().max(20).default(""),
  phone: z.string().trim().max(40).default(""),
  symptoms: z.string().trim().max(2000).default(""),
  conditions: listField,
  allergies: listField,
  medications: listField,
  surgeries: listField,
  familyHistory: listField,
});

export async function getHistory(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const history = await medicalHistoryService.getMedicalHistoryForPatient(req.user.sub);
    res.json({ success: true, history });
  } catch (error) {
    next(error);
  }
}

export async function saveHistory(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const body = upsertBodySchema.parse(req.body);
    const history = await medicalHistoryService.upsertMedicalHistoryForPatient(req.user.sub, body);
    res.json({ success: true, history, message: "Medical history saved" });
  } catch (error) {
    next(error);
  }
}
