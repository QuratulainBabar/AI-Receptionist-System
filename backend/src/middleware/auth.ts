import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export type AuthPayload = {
  sub: string;
  role: Role;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError(401, "Authentication required"));
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = payload;
    return next();
  } catch {
    return next(new AppError(401, "Invalid or expired token"));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AppError(401, "Authentication required"));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "You do not have permission for this resource"));
    }
    return next();
  };
}
