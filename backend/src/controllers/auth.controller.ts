import type { NextFunction, Request, Response } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "../utils/validation.js";
import * as authService from "../services/auth.service.js";

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const body = signupSchema.parse(req.body);
    const result = await authService.signupUser(body);
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.loginUser(body);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const result = await authService.requestPasswordReset(body.email);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(body);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function adminLogin(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.loginAdmin(body);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getCurrentUser(req.user!.sub);
    res.json({ success: true, user });
  } catch (error) {
    next(error);
  }
}
