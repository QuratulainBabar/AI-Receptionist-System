import type { NextFunction, Request, Response } from "express";
import * as messagesService from "../services/messages.service.js";
import { AppError } from "../utils/AppError.js";

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const messages = await messagesService.listMessagesForPatient(req.user.sub);
    res.json({ success: true, messages });
  } catch (error) {
    next(error);
  }
}
