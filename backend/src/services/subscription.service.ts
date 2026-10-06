import type Stripe from "stripe";
import { Role, type BillingCycle, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { getStripe, isStripeConfigured } from "../lib/stripe.js";
import { AppError } from "../utils/AppError.js";
import { mapStripeStatus, toPublicPlan, toPublicSubscription } from "./subscription.mapper.js";

const CURRENT_STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE"] as const;

type PlanInput = {
  name: string;
  description?: string;
  amountCents: number;
  currency?: string;
  billingCycle: BillingCycle;
  features?: string[];
  isActive?: boolean;
  sortOrder?: number;
  trialDays?: number;
};

function dateFromUnix(seconds: number | null | undefined) {
  if (!seconds) return null;
  return new Date(seconds * 1000);
}

function periodFromStripe(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0] as
    | (Stripe.SubscriptionItem & { current_period_start?: number; current_period_end?: number })
    | undefined;
  const legacy = sub as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const start = item?.current_period_start ?? legacy.current_period_start;
  const end = item?.current_period_end ?? legacy.current_period_end;
  return {
    currentPeriodStart: dateFromUnix(start),
    currentPeriodEnd: dateFromUnix(end),
  };
}

function stripeInterval(cycle: BillingCycle): Stripe.Price.Recurring.Interval {
  return cycle === "YEARLY" ? "year" : "month";
}

async function subscriberCountsByPlan() {
  const groups = await prisma.subscription.groupBy({
    by: ["planId"],
    where: { status: { in: [...CURRENT_STATUSES] } },
    _count: { _all: true },
  });
  return new Map(groups.map((row) => [row.planId, row._count._all]));
}

export async function listPlansForAdmin() {
  const plans = await prisma.subscriptionPlan.findMany({
    orderBy: [{ sortOrder: "asc" }, { amountCents: "asc" }],
  });
  const counts = await subscriberCountsByPlan();
  return plans.map((plan) => toPublicPlan(plan, counts.get(plan.id) ?? 0));
}

export async function listActivePlans() {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { amountCents: "asc" }],
  });
  const counts = await subscriberCountsByPlan();
  return plans.map((plan) => toPublicPlan(plan, counts.get(plan.id) ?? 0));
}

export async function createPlan(input: PlanInput) {
  const stripe = getStripe();
  const currency = (input.currency || "usd").toLowerCase();
  const product = await stripe.products.create({
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    metadata: { platform: "ai-receptionist" },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency,
    unit_amount: input.amountCents,
    recurring: { interval: stripeInterval(input.billingCycle) },
    metadata: { platform: "ai-receptionist" },
  });

  const plan = await prisma.subscriptionPlan.create({
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || "",
      amountCents: input.amountCents,
      currency,
      billingCycle: input.billingCycle,
      features: input.features ?? [],
      stripeProductId: product.id,
      stripePriceId: price.id,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
      trialDays: input.trialDays ?? 0,
    },
  });
  return toPublicPlan(plan, 0);
}

export async function updatePlan(planId: string, input: Partial<PlanInput>) {
  const existing = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!existing) throw new AppError(404, "Subscription plan not found");
  const stripe = getStripe();

  const name = input.name?.trim() ?? existing.name;
  const description = input.description !== undefined ? input.description.trim() : existing.description;
  const currency = (input.currency || existing.currency).toLowerCase();
  const billingCycle = input.billingCycle ?? existing.billingCycle;
  const amountCents = input.amountCents ?? existing.amountCents;

  await stripe.products.update(existing.stripeProductId, {
    name,
    description: description || undefined,
    active: input.isActive ?? existing.isActive,
  });

  let stripePriceId = existing.stripePriceId;
  const priceChanged =
    amountCents !== existing.amountCents ||
    currency !== existing.currency ||
    billingCycle !== existing.billingCycle;

  if (priceChanged) {
    const price = await stripe.prices.create({
      product: existing.stripeProductId,
      currency,
      unit_amount: amountCents,
      recurring: { interval: stripeInterval(billingCycle) },
      metadata: { platform: "ai-receptionist", planId },
    });
    await stripe.prices.update(existing.stripePriceId, { active: false }).catch(() => undefined);
    stripePriceId = price.id;
  }

  const plan = await prisma.subscriptionPlan.update({
    where: { id: planId },
    data: {
      name,
      description,
      amountCents,
      currency,
      billingCycle,
      features: input.features ?? existing.features,
      stripePriceId,
      isActive: input.isActive ?? existing.isActive,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      trialDays: input.trialDays ?? existing.trialDays,
    },
  });
  const counts = await subscriberCountsByPlan();
  return toPublicPlan(plan, counts.get(plan.id) ?? 0);
}

export async function setPlanActive(planId: string, isActive: boolean) {
  return updatePlan(planId, { isActive });
}

async function ensureStripeCustomer(user: { id: string; email: string; fullName: string; stripeCustomerId: string | null }) {
  const stripe = getStripe();
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.fullName,
    metadata: { userId: user.id, role: "DOCTOR" },
  });
  await prisma.user.update({
    where: { id: user.id },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

export async function upsertFromStripeSubscription(stripeSub: Stripe.Subscription, fallbackUserId?: string) {
  const stripeCustomerId =
    typeof stripeSub.customer === "string" ? stripeSub.customer : stripeSub.customer?.id;
  if (!stripeCustomerId) {
    throw new AppError(400, "Stripe subscription is missing a customer");
  }

  const price = stripeSub.items.data[0]?.price;
  const stripePriceId = typeof price === "string" ? price : price?.id;
  if (!stripePriceId) {
    throw new AppError(400, "Stripe subscription is missing a price");
  }

  const metadataUserId = stripeSub.metadata?.userId || fallbackUserId || "";
  const user = metadataUserId
    ? await prisma.user.findUnique({ where: { id: metadataUserId } })
    : await prisma.user.findUnique({ where: { stripeCustomerId } });

  if (!user || user.role !== Role.DOCTOR) {
    return null;
  }

  if (!user.stripeCustomerId) {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId },
    });
  }

  let plan = await prisma.subscriptionPlan.findUnique({ where: { stripePriceId } });
  if (!plan && stripeSub.metadata?.planId) {
    plan = await prisma.subscriptionPlan.findUnique({ where: { id: stripeSub.metadata.planId } });
  }
  if (!plan) {
    throw new AppError(409, `No local plan matches Stripe price ${stripePriceId}`);
  }

  const period = periodFromStripe(stripeSub);
  const amountCents =
    (typeof price !== "string" ? price?.unit_amount : null) ?? plan.amountCents;
  const currency = (typeof price !== "string" ? price?.currency : null) ?? plan.currency;

  const data = {
    userId: user.id,
    planId: plan.id,
    stripeCustomerId,
    stripeSubscriptionId: stripeSub.id,
    stripePriceId,
    status: mapStripeStatus(stripeSub.status),
    amountCents,
    currency,
    billingCycle: plan.billingCycle,
    currentPeriodStart: period.currentPeriodStart,
    currentPeriodEnd: period.currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(stripeSub.cancel_at_period_end),
    canceledAt: dateFromUnix(stripeSub.canceled_at),
    trialStart: dateFromUnix(stripeSub.trial_start),
    trialEnd: dateFromUnix(stripeSub.trial_end),
  };

  const row = await prisma.subscription.upsert({
    where: { stripeSubscriptionId: stripeSub.id },
    create: data,
    update: data,
    include: { plan: true, user: true },
  });
  return toPublicSubscription(row);
}

const ENROLLED_STATUSES = ["ACTIVE", "TRIALING"] as const;

export function isEnrolledStatus(status: string | null | undefined) {
  return status === "ACTIVE" || status === "TRIALING";
}

export async function getCurrentSubscriptionForUser(userId: string) {
  const enrolled = await prisma.subscription.findFirst({
    where: { userId, status: { in: [...ENROLLED_STATUSES] } },
    include: { plan: true, user: true },
    orderBy: { createdAt: "desc" },
  });
  if (enrolled) return toPublicSubscription(enrolled);

  const row = await prisma.subscription.findFirst({
    where: { userId },
    include: { plan: true, user: true },
    orderBy: { createdAt: "desc" },
  });
  return row ? toPublicSubscription(row) : null;
}

type DoctorModule = { id: string; label: string; to: string; group: string };

const CLINICAL_MODULES: DoctorModule[] = [
  { id: "schedule", label: "Appointment schedule", to: "/doctor/schedule", group: "Today" },
  { id: "notifications", label: "Notifications", to: "/doctor/notifications", group: "Today" },
  { id: "patients", label: "Patient list", to: "/doctor/patients", group: "Patients" },
  { id: "records", label: "History & reports", to: "/doctor/records", group: "Patients" },
  { id: "activity", label: "Activity history", to: "/doctor/activity", group: "Patients" },
];

function modulesForPlan(ready: boolean): DoctorModule[] {
  const practice: DoctorModule[] = [
    { id: "dashboard", label: "Dashboard", to: "/doctor", group: "Today" },
    { id: "profile", label: "My profile", to: "/doctor/profile", group: "Practice" },
    { id: "availability", label: "Availability", to: "/doctor/availability", group: "Practice" },
    { id: "subscription", label: "Subscription", to: "/doctor/subscription", group: "Practice" },
  ];
  if (!ready) return practice;
  return [
    practice[0]!,
    ...CLINICAL_MODULES.filter((mod) => mod.group === "Today"),
    ...practice.slice(1),
    ...CLINICAL_MODULES.filter((mod) => mod.group === "Patients"),
  ];
}

export async function getDoctorAccess(userId: string) {
  const subscription = await getCurrentSubscriptionForUser(userId);
  const enrolled = isEnrolledStatus(subscription?.status);
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId },
    include: {
      specialty: true,
      _count: { select: { availability: true } },
    },
  });
  const profileComplete = Boolean(
    profile &&
      profile.specialtyId !== "unspecified" &&
      profile.specialty.name.trim() &&
      profile.clinic.trim(),
  );
  const availabilityComplete = (profile?._count.availability ?? 0) > 0;
  const ready = enrolled && profileComplete && availabilityComplete;

  let planFeatures: string[] = [];
  if (subscription) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: subscription.planId },
      select: { features: true },
    });
    planFeatures = plan?.features ?? [];
  }

  const modules = enrolled ? modulesForPlan(ready) : [];
  const upcomingModules =
    enrolled && !ready
      ? modulesForPlan(true).filter(
          (mod) => !["dashboard", "profile", "availability", "subscription"].includes(mod.id),
        )
      : [];

  return {
    enrolled,
    profileComplete,
    availabilityComplete,
    ready,
    planName: enrolled ? (subscription?.planName ?? null) : null,
    planFeatures: enrolled ? planFeatures : [],
    modules,
    upcomingModules,
    subscription: enrolled ? subscription : subscription,
  };
}

export async function isDoctorEnrolled(userId: string) {
  const row = await prisma.subscription.findFirst({
    where: { userId, status: { in: [...ENROLLED_STATUSES] } },
    select: { id: true },
  });
  return Boolean(row);
}

export async function isDoctorReady(userId: string) {
  const access = await getDoctorAccess(userId);
  return access.ready;
}

export async function listSubscriptionsForAdmin(input?: { q?: string; status?: string; planId?: string }) {
  const and: Prisma.SubscriptionWhereInput[] = [];
  if (input?.status && input.status !== "all") {
    and.push({ status: input.status as Prisma.SubscriptionWhereInput["status"] });
  }
  if (input?.planId) and.push({ planId: input.planId });
  if (input?.q?.trim()) {
    const q = input.q.trim();
    and.push({
      OR: [
        { user: { fullName: { contains: q, mode: "insensitive" } } },
        { user: { email: { contains: q, mode: "insensitive" } } },
        { user: { reference: { contains: q, mode: "insensitive" } } },
        { stripeSubscriptionId: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  const rows = await prisma.subscription.findMany({
    where: and.length ? { AND: and } : undefined,
    include: { plan: true, user: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toPublicSubscription);
}

export async function getSubscriptionForAdmin(id: string) {
  const row = await prisma.subscription.findUnique({
    where: { id },
    include: { plan: true, user: true },
  });
  if (!row) throw new AppError(404, "Subscription not found");
  return toPublicSubscription(row);
}

export async function assignPlanToDoctor(userId: string, planId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== Role.DOCTOR) {
    throw new AppError(404, "Doctor not found");
  }
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) {
    throw new AppError(404, "Active subscription plan not found");
  }

  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(user);

  const current = await prisma.subscription.findFirst({
    where: { userId, status: { in: [...CURRENT_STATUSES] } },
    orderBy: { createdAt: "desc" },
  });
  if (current) {
    await stripe.subscriptions.cancel(current.stripeSubscriptionId).catch(() => undefined);
  }

  const params: Stripe.SubscriptionCreateParams = {
    customer: customerId,
    items: [{ price: plan.stripePriceId }],
    metadata: { userId: user.id, planId: plan.id },
  };
  if (plan.trialDays > 0) {
    params.trial_period_days = plan.trialDays;
  } else {
    params.collection_method = "send_invoice";
    params.days_until_due = 7;
  }
  const created = await stripe.subscriptions.create(params);

  return upsertFromStripeSubscription(created, user.id);
}

function checkoutReturnOrigin(requested?: string) {
  const fallback = env.CLIENT_URL.replace(/\/$/, "");
  const raw = (requested || "").trim();
  if (!raw) return fallback;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fallback;
  }
  if (url.origin === new URL(fallback).origin) return url.origin;
  const localHost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (env.NODE_ENV !== "production" && localHost && (url.protocol === "http:" || url.protocol === "https:")) {
    return url.origin;
  }
  return fallback;
}

export async function createCheckoutSession(userId: string, planId: string, returnOrigin?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== Role.DOCTOR) {
    throw new AppError(403, "Only doctors can start a subscription checkout");
  }
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan || !plan.isActive) {
    throw new AppError(404, "That plan is not available");
  }

  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(user);
  const origin = checkoutReturnOrigin(returnOrigin);
  const current = await getCurrentSubscriptionForUser(user.id);
  const alreadyEnrolled = isEnrolledStatus(current?.status);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${origin}/doctor?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: alreadyEnrolled
      ? `${origin}/doctor/subscription?checkout=cancelled`
      : `${origin}/doctor/onboarding?checkout=cancelled`,
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: {
      metadata: { userId: user.id, planId: plan.id },
      trial_period_days: plan.trialDays > 0 ? plan.trialDays : undefined,
    },
  });

  if (!session.url) {
    throw new AppError(502, "Stripe did not return a checkout URL");
  }
  return { url: session.url, sessionId: session.id };
}

export async function confirmCheckoutSession(userId: string, sessionId: string) {
  if (!sessionId.startsWith("cs_")) {
    throw new AppError(400, "Invalid checkout session");
  }
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
  const owner = session.metadata?.userId || session.client_reference_id || "";
  if (owner !== userId) {
    throw new AppError(403, "This checkout does not belong to your account");
  }

  const paid =
    session.payment_status === "paid" || session.payment_status === "no_payment_required";
  const stripeSub = session.subscription;
  if (session.status === "complete" && paid && stripeSub) {
    const sub =
      typeof stripeSub === "string" ? await stripe.subscriptions.retrieve(stripeSub) : stripeSub;
    await upsertFromStripeSubscription(sub, userId);
  }

  const access = await getDoctorAccess(userId);
  return { enrolled: access.enrolled, access };
}

export async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!subscriptionId) break;
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      await upsertFromStripeSubscription(sub, session.metadata?.userId || session.client_reference_id || undefined);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await upsertFromStripeSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | { id?: string };
        parent?: { subscription_details?: { subscription?: string | { id?: string } } };
      };
      const raw =
        invoice.subscription || invoice.parent?.subscription_details?.subscription;
      const id = typeof raw === "string" ? raw : raw?.id;
      if (!id) break;
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(id);
      await upsertFromStripeSubscription(sub);
      break;
    }
    default:
      break;
  }
}

export async function getSubscriptionOverview() {
  const [plans, active, trialing, pastDue, cancelled, expired] = await Promise.all([
    listPlansForAdmin(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.subscription.count({ where: { status: "TRIALING" } }),
    prisma.subscription.count({ where: { status: "PAST_DUE" } }),
    prisma.subscription.count({ where: { status: "CANCELLED" } }),
    prisma.subscription.count({ where: { status: "EXPIRED" } }),
  ]);
  return {
    stripeConfigured: isStripeConfigured(),
    plans: plans.length,
    activePlans: plans.filter((plan) => plan.isActive).length,
    active,
    trialing,
    pastDue,
    cancelled,
    expired,
    currentSubscribers: active + trialing + pastDue,
  };
}

export async function latestSubscriptionByUserIds(userIds: string[]) {
  if (!userIds.length) return new Map<string, ReturnType<typeof toPublicSubscription>>();
  const rows = await prisma.subscription.findMany({
    where: { userId: { in: userIds } },
    include: { plan: true, user: true },
    orderBy: { createdAt: "desc" },
  });
  const map = new Map<string, ReturnType<typeof toPublicSubscription>>();
  for (const row of rows) {
    if (!map.has(row.userId)) map.set(row.userId, toPublicSubscription(row));
  }
  return map;
}
