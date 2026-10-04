import { z } from "zod";

export const signupSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
  email: z.string().trim().email("Enter a valid email").transform((v) => v.toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  role: z.enum(["patient", "doctor"]),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email").transform((v) => v.toLowerCase()),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email").transform((v) => v.toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20, "Reset token is required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});
