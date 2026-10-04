import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as doctorsService from "../services/doctors.service.js";

const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  specialtyId: z.string().trim().optional(),
});

const availabilityQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function listSpecialties(_req: Request, res: Response, next: NextFunction) {
  try {
    const specialties = await doctorsService.listSpecialties();
    res.json({ success: true, specialties });
  } catch (error) {
    next(error);
  }
}

export async function listDoctors(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const doctors = await doctorsService.listDoctors({
      q: query.q,
      specialtyId: query.specialtyId,
    });
    res.json({ success: true, doctors });
  } catch (error) {
    next(error);
  }
}

export async function getDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    const doctorId = String(req.params.doctorId);
    const doctor = await doctorsService.getDoctorByUserId(doctorId);
    res.json({ success: true, doctor });
  } catch (error) {
    next(error);
  }
}

export async function getAvailability(req: Request, res: Response, next: NextFunction) {
  try {
    const doctorId = String(req.params.doctorId);
    const query = availabilityQuerySchema.parse(req.query);
    const availability = await doctorsService.getDoctorAvailability(doctorId, query.date);
    res.json({ success: true, availability });
  } catch (error) {
    next(error);
  }
}
