import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import * as appointmentsService from "../services/appointments.service.js";
import * as appointmentInvoicesService from "../services/appointment-invoices.service.js";
import { AppError } from "../utils/AppError.js";

const createBodySchema = z.object({
  doctorId: z.string().min(1),
  slotId: z.string().min(1),
  reason: z.string().trim().max(1000).optional(),
});

const statusBodySchema = z.object({
  status: z.enum(["confirmed", "pending", "completed", "cancelled"]),
});

const followUpBodySchema = z.object({
  slotId: z.string().min(1),
  reason: z.string().trim().max(1000).optional(),
  mode: z.enum(["In clinic", "Video call"]).optional(),
});

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const body = createBodySchema.parse(req.body);
    const appointment = await appointmentsService.createAppointment({
      patientId: req.user.sub,
      doctorId: body.doctorId,
      slotId: body.slotId,
      reason: body.reason,
    });
    res.status(201).json({ success: true, appointment });
  } catch (error) {
    next(error);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const appointments = await appointmentsService.listAppointmentsForPatient(req.user.sub);
    res.json({ success: true, appointments });
  } catch (error) {
    next(error);
  }
}

export async function getOne(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const appointmentId = String(req.params.appointmentId);
    const appointment = await appointmentsService.getAppointmentForPatient(appointmentId, req.user.sub);
    res.json({ success: true, appointment });
  } catch (error) {
    next(error);
  }
}

export async function listForDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const appointments = await appointmentsService.listAppointmentsForDoctor(req.user.sub);
    res.json({ success: true, appointments });
  } catch (error) {
    next(error);
  }
}

export async function getOneForDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const appointmentId = String(req.params.appointmentId);
    const appointment = await appointmentsService.getAppointmentForDoctor(appointmentId, req.user.sub);
    res.json({ success: true, appointment });
  } catch (error) {
    next(error);
  }
}

export async function updateStatusForDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const appointmentId = String(req.params.appointmentId);
    const body = statusBodySchema.parse(req.body ?? {});
    const appointment = await appointmentsService.updateAppointmentStatusForDoctor(
      appointmentId,
      req.user.sub,
      body.status,
    );
    res.json({ success: true, appointment, message: `Appointment marked as ${body.status}.` });
  } catch (error) {
    next(error);
  }
}

export async function sendInvoiceForDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const appointmentId = String(req.params.appointmentId);
    const result = await appointmentInvoicesService.sendInvoiceForDoctor(req.user.sub, appointmentId);
    const appointment = await appointmentsService.getAppointmentForDoctor(appointmentId, req.user.sub);
    res.json({
      success: true,
      appointment,
      message: result.message,
      paymentUrl: result.paymentUrl,
    });
  } catch (error) {
    next(error);
  }
}

export async function createFollowUpForDoctor(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user?.sub) {
      throw new AppError(401, "Authentication required");
    }
    const appointmentId = String(req.params.appointmentId);
    const body = followUpBodySchema.parse(req.body ?? {});
    const result = await appointmentsService.createFollowUpAppointmentForDoctor({
      doctorUserId: req.user.sub,
      parentAppointmentId: appointmentId,
      slotId: body.slotId,
      reason: body.reason,
      mode: body.mode,
    });
    res.status(201).json({
      success: true,
      appointment: result.appointment,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}
