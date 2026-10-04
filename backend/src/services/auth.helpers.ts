import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Role, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import type { AuthPayload } from "../middleware/auth.js";

const SALT_ROUNDS = 12;

export type PublicRole = "patient" | "doctor" | "admin";

export type PublicUser = {
  id: string;
  email: string;
  fullName: string;
  role: PublicRole;
  reference: string;
  isActive: boolean;
  createdAt: string;
};

export function toPublicRole(role: Role): PublicRole {
  if (role === "DOCTOR") return "doctor";
  if (role === "SUPER_ADMIN") return "admin";
  return "patient";
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: toPublicRole(user.role),
    reference: user.reference,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toPrismaRole(role: "patient" | "doctor"): Role {
  return role === "doctor" ? "DOCTOR" : "PATIENT";
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function signAccessToken(user: User) {
  const payload: AuthPayload = {
    sub: user.id,
    role: user.role,
    email: user.email,
  };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function generateUniqueReference(role: Role) {
  const prefix = role === "DOCTOR" ? "DR" : role === "SUPER_ADMIN" ? "SA" : "PT";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
    const existing = await prisma.user.findUnique({ where: { reference } });
    if (!existing) return reference;
  }
  throw new AppError(500, "Could not generate a unique reference");
}
