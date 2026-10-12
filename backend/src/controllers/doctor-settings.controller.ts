import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  getDoctorSmsPreferences,
  updateDoctorSmsPreferences,
  type SmsPreferences,
} from "../services/doctor-sms-preferences.service.js";

const smsPreferencesSchema = z.object({
  appointmentReminders: z.boolean(),
  appointmentConfirmations: z.boolean(),
  invoiceLinks: z.boolean(),
  recordUploads: z.boolean(),
});

export async function getSmsPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const preferences = await getDoctorSmsPreferences(req.user!.sub);
    res.json({ success: true, preferences });
  } catch (error) {
    next(error);
  }
}

export async function updateSmsPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const body = smsPreferencesSchema.parse(req.body) satisfies SmsPreferences;
    const preferences = await updateDoctorSmsPreferences(req.user!.sub, body);
    res.json({ success: true, preferences, message: "SMS notification settings saved." });
  } catch (error) {
    next(error);
  }
}
