import type { BillingCycle, Subscription, SubscriptionPlan, SubscriptionStatus, User } from "@prisma/client";

export function cycleLabel(cycle: BillingCycle) {
  return cycle === "YEARLY" ? "Yearly" : "Monthly";
}

export function statusLabel(status: SubscriptionStatus) {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "TRIALING":
      return "Trialing";
    case "PAST_DUE":
      return "Past Due";
    case "CANCELLED":
      return "Cancelled";
    case "EXPIRED":
      return "Expired";
    default:
      return status;
  }
}

export function formatMoney(amountCents: number, currency = "usd") {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${(amountCents / 100).toFixed(2)}`;
  }
}

export function mapStripeStatus(status: string | null | undefined): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIALING";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "canceled":
    case "paused":
      return "CANCELLED";
    case "incomplete_expired":
      return "EXPIRED";
    case "incomplete":
      return "PAST_DUE";
    default:
      return "EXPIRED";
  }
}

export function toPublicPlan(
  plan: SubscriptionPlan & { _count?: { subscriptions: number } },
  subscriberCount = 0,
) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    amountCents: plan.amountCents,
    amountLabel: formatMoney(plan.amountCents, plan.currency),
    currency: plan.currency,
    billingCycle: plan.billingCycle,
    billingCycleLabel: cycleLabel(plan.billingCycle),
    features: plan.features,
    stripeProductId: plan.stripeProductId,
    stripePriceId: plan.stripePriceId,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    trialDays: plan.trialDays,
    subscriberCount,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export function toPublicSubscription(
  row: Subscription & {
    plan: SubscriptionPlan;
    user?: Pick<User, "id" | "fullName" | "email" | "reference">;
  },
) {
  return {
    id: row.id,
    userId: row.userId,
    doctorName: row.user?.fullName ?? null,
    doctorEmail: row.user?.email ?? null,
    doctorReference: row.user?.reference ?? null,
    planId: row.planId,
    planName: row.plan.name,
    amountCents: row.amountCents,
    amountLabel: formatMoney(row.amountCents, row.currency),
    currency: row.currency,
    billingCycle: row.billingCycle,
    billingCycleLabel: cycleLabel(row.billingCycle),
    status: row.status,
    statusLabel: statusLabel(row.status),
    stripeCustomerId: row.stripeCustomerId,
    stripeSubscriptionId: row.stripeSubscriptionId,
    stripePriceId: row.stripePriceId,
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    trialStart: row.trialStart?.toISOString() ?? null,
    trialEnd: row.trialEnd?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
