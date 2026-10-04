import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  createOrUpdateClinicSynthflowAgent,
  getClinicVoiceSettings,
  syncClinicDirectoryToSynthflow,
  updateClinicVoiceSettings,
} from "../services/clinic-synthflow.service.js";

const updateSchema = z.object({
  clinicName: z.string().trim().max(120).optional(),
  phoneNumber: z.string().trim().max(40).optional(),
  synthflowAgentId: z.string().trim().max(120).nullable().optional(),
  agentLanguage: z.string().trim().max(20).optional(),
  agentVoiceId: z.string().trim().max(120).optional(),
  agentFirstMessage: z.string().trim().max(500).optional(),
  agentSystemPrompt: z.string().trim().max(50000).optional(),
});

const createAgentSchema = z.object({
  firstMessage: z.string().trim().max(500).optional(),
  systemPrompt: z.string().trim().max(50000).optional(),
  phoneNumber: z.string().trim().max(40).optional(),
  language: z.string().trim().max(20).optional(),
  voiceId: z.string().trim().max(120).optional(),
  synthflowAgentId: z.string().trim().max(120).optional(),
});

export async function getSynthflowConfig(_req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await getClinicVoiceSettings();
    return res.json({ success: true, settings });
  } catch (error) {
    return next(error);
  }
}

export async function updateSynthflowConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateSchema.parse(req.body);
    const settings = await updateClinicVoiceSettings(body);
    return res.json({ success: true, settings });
  } catch (error) {
    return next(error);
  }
}

export async function createOrUpdateAgent(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createAgentSchema.parse(req.body ?? {});
    const result = await createOrUpdateClinicSynthflowAgent(body);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}

export async function syncDirectory(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await syncClinicDirectoryToSynthflow();
    return res.json(result);
  } catch (error) {
    return next(error);
  }
}
