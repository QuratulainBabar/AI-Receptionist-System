import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { getStripe, isStripeConfigured } from "../lib/stripe.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import * as subscriptionService from "../services/subscription.service.js";
import { handleStripeInvoiceEvent } from "../services/appointment-invoices.service.js";

const billingCycleSchema = z.enum(["MONTHLY", "YEARLY"]);

const planBodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional().default(""),
  amountCents: z.coerce.number().int().min(50).max(10_000_000),
  currency: z.string().trim().min(3).max(8).optional().default("usd"),
  billingCycle: billingCycleSchema,
  features: z.array(z.string().trim().min(1).max(160)).max(20).optional().default([]),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  trialDays: z.coerce.number().int().min(0).max(90).optional(),
});

const planPatchSchema = planBodySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  planId: z.string().optional(),
});

const assignBodySchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
});

const checkoutBodySchema = z.object({
  planId: z.string().min(1),
  returnOrigin: z.string().trim().max(200).optional(),
});

const confirmCheckoutSchema = z.object({
  sessionId: z.string().trim().min(8).max(255),
});

export async function overview(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await subscriptionService.getSubscriptionOverview();
    res.json({ success: true, overview: data });
  } catch (error) {
    next(error);
  }
}

export async function listPlans(_req: Request, res: Response, next: NextFunction) {
  try {
    const plans = await subscriptionService.listPlansForAdmin();
    res.json({ success: true, plans });
  } catch (error) {
    next(error);
  }
}

export async function createPlan(req: Request, res: Response, next: NextFunction) {
  try {
    const body = planBodySchema.parse(req.body);
    const plan = await subscriptionService.createPlan(body);
    res.status(201).json({ success: true, plan, message: `${plan.name} created in Stripe and saved.` });
  } catch (error) {
    next(error);
  }
}

export async function updatePlan(req: Request, res: Response, next: NextFunction) {
  try {
    const body = planPatchSchema.parse(req.body);
    const plan = await subscriptionService.updatePlan(String(req.params.planId), body);
    res.json({ success: true, plan, message: `${plan.name} updated.` });
  } catch (error) {
    next(error);
  }
}

export async function setPlanActive(req: Request, res: Response, next: NextFunction) {
  try {
    const body = z.object({ isActive: z.boolean() }).parse(req.body);
    const plan = await subscriptionService.setPlanActive(String(req.params.planId), body.isActive);
    res.json({
      success: true,
      plan,
      message: plan.isActive ? `${plan.name} is active.` : `${plan.name} is deactivated.`,
    });
  } catch (error) {
    next(error);
  }
}

export async function listSubscriptions(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const subscriptions = await subscriptionService.listSubscriptionsForAdmin(query);
    res.json({ success: true, subscriptions });
  } catch (error) {
    next(error);
  }
}

export async function getSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const subscription = await subscriptionService.getSubscriptionForAdmin(String(req.params.subscriptionId));
    res.json({ success: true, subscription });
  } catch (error) {
    next(error);
  }
}

export async function assignSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const body = assignBodySchema.parse(req.body);
    const subscription = await subscriptionService.assignPlanToDoctor(body.userId, body.planId);
    res.json({
      success: true,
      subscription,
      message: subscription
        ? `Assigned ${subscription.planName} to ${subscription.doctorName}.`
        : "Stripe subscription created.",
    });
  } catch (error) {
    next(error);
  }
}

export async function listPublicPlans(_req: Request, res: Response, next: NextFunction) {
  try {
    const plans = await subscriptionService.listActivePlans();
    res.json({ success: true, plans, stripeConfigured: isStripeConfigured() });
  } catch (error) {
    next(error);
  }
}

export async function getMine(req: Request, res: Response, next: NextFunction) {
  try {
    const subscription = await subscriptionService.getCurrentSubscriptionForUser(req.user!.sub);
    res.json({ success: true, subscription, stripeConfigured: isStripeConfigured() });
  } catch (error) {
    next(error);
  }
}

export async function getAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const access = await subscriptionService.getDoctorAccess(req.user!.sub);
    res.json({ success: true, access });
  } catch (error) {
    next(error);
  }
}

export async function confirmCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const body = confirmCheckoutSchema.parse(req.body);
    const result = await subscriptionService.confirmCheckoutSession(req.user!.sub, body.sessionId);
    res.json({ success: true, enrolled: result.enrolled, access: result.access });
  } catch (error) {
    next(error);
  }
}

export async function startCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const body = checkoutBodySchema.parse(req.body);
    const checkout = await subscriptionService.createCheckoutSession(
      req.user!.sub,
      body.planId,
      body.returnOrigin,
    );
    res.json({ success: true, checkout });
  } catch (error) {
    next(error);
  }
}

export async function stripeWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    if (!isStripeConfigured()) {
      throw new AppError(503, "Stripe is not configured");
    }
    const signature = req.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) {
      throw new AppError(400, "Missing Stripe-Signature header");
    }
    const secret = env.STRIPE_WEBHOOK_SECRET.trim();
    if (!secret) {
      throw new AppError(503, "STRIPE_WEBHOOK_SECRET is not set");
    }
    const stripe = getStripe();
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    const appointmentInvoice = await handleStripeInvoiceEvent(event);
    if (!appointmentInvoice) {
      await subscriptionService.handleStripeEvent(event);
    }
    res.json({ received: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Signature")) {
      return next(new AppError(400, "Invalid Stripe webhook signature"));
    }
    next(error);
  }
}
