import type Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { getStripe, isStripeConfigured } from "../lib/stripe.js";
import { formatMoney } from "./subscription.mapper.js";

export type EarningsRangeKey = "this_month" | "last_month" | "last_3_months" | "custom";

type Range = { start: Date; end: Date; previousStart: Date; previousEnd: Date; label: string };

function startOfMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addMonths(d: Date, months: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function endOfDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

function parseDay(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!, 0, 0, 0, 0));
}

export function resolveEarningsRange(input: {
  range?: string;
  from?: string;
  to?: string;
}): Range {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const nextMonthStart = addMonths(thisMonthStart, 1);
  const lastMonthStart = addMonths(thisMonthStart, -1);
  const key = (input.range || "this_month") as EarningsRangeKey;

  if (key === "custom") {
    const from = parseDay(input.from) || lastMonthStart;
    const to = parseDay(input.to) || endOfDay(now);
    const end = to < from ? from : to;
    const duration = end.getTime() - from.getTime();
    const previousEnd = new Date(from.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - duration);
    return {
      start: from,
      end: endOfDay(end),
      previousStart,
      previousEnd,
      label: "Custom range",
    };
  }

  if (key === "last_month") {
    return {
      start: lastMonthStart,
      end: new Date(thisMonthStart.getTime() - 1),
      previousStart: addMonths(lastMonthStart, -1),
      previousEnd: new Date(lastMonthStart.getTime() - 1),
      label: "Last month",
    };
  }

  if (key === "last_3_months") {
    const start = addMonths(thisMonthStart, -2);
    return {
      start,
      end: endOfDay(now),
      previousStart: addMonths(start, -3),
      previousEnd: new Date(start.getTime() - 1),
      label: "Last 3 months",
    };
  }

  return {
    start: thisMonthStart,
    end: endOfDay(now),
    previousStart: lastMonthStart,
    previousEnd: new Date(thisMonthStart.getTime() - 1),
    label: "This month",
  };
}

function invoiceAmountPaid(invoice: Stripe.Invoice) {
  return typeof invoice.amount_paid === "number" ? invoice.amount_paid : 0;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const raw =
    (invoice as Stripe.Invoice & { subscription?: string | { id?: string } }).subscription ||
    (
      invoice as Stripe.Invoice & {
        parent?: { subscription_details?: { subscription?: string | { id?: string } } };
      }
    ).parent?.subscription_details?.subscription;
  return typeof raw === "string" ? raw : raw?.id || "";
}

function invoicePaymentIntentId(invoice: Stripe.Invoice) {
  const pi = (invoice as Stripe.Invoice & { payment_intent?: string | { id?: string } }).payment_intent;
  return typeof pi === "string" ? pi : pi?.id || "";
}

function invoicePaidAt(invoice: Stripe.Invoice) {
  if (invoice.status_transitions?.paid_at) {
    return new Date(invoice.status_transitions.paid_at * 1000);
  }
  if (invoice.created) return new Date(invoice.created * 1000);
  return new Date();
}

export async function recordSubscriptionPaymentFromInvoice(invoice: Stripe.Invoice) {
  if (invoice.status !== "paid") return null;
  const amountCents = invoiceAmountPaid(invoice);
  if (amountCents <= 0) return null;

  const stripeSubscriptionId = invoiceSubscriptionId(invoice);
  const localSub = stripeSubscriptionId
    ? await prisma.subscription.findUnique({ where: { stripeSubscriptionId } })
    : null;

  // Skip orphan Stripe invoices that cannot be linked to a clinic doctor —
  // otherwise Earnings shows "Unknown doctor" rows with empty plan/interval.
  if (!localSub?.userId) {
    const existing = await prisma.subscriptionPayment.findUnique({
      where: { stripeInvoiceId: invoice.id },
      select: { id: true },
    });
    if (existing) {
      await prisma.subscriptionPayment.delete({ where: { id: existing.id } });
    }
    return null;
  }

  const status =
    (invoice as Stripe.Invoice & { amount_remaining?: number }).amount_remaining &&
    (invoice as Stripe.Invoice & { amount_remaining?: number }).amount_remaining! > 0 &&
    amountCents < (invoice.total || amountCents)
      ? "REFUNDED"
      : "PAID";

  return prisma.subscriptionPayment.upsert({
    where: { stripeInvoiceId: invoice.id },
    create: {
      subscriptionId: localSub.id,
      userId: localSub.userId,
      planId: localSub.planId,
      stripeInvoiceId: invoice.id,
      stripePaymentIntentId: invoicePaymentIntentId(invoice),
      stripeSubscriptionId,
      invoiceNumber: invoice.number || "",
      amountCents,
      currency: (invoice.currency || localSub.currency || "usd").toLowerCase(),
      status,
      billingReason: invoice.billing_reason || "",
      paidAt: invoicePaidAt(invoice),
    },
    update: {
      subscriptionId: localSub.id,
      userId: localSub.userId,
      planId: localSub.planId,
      stripePaymentIntentId: invoicePaymentIntentId(invoice) || undefined,
      stripeSubscriptionId: stripeSubscriptionId || undefined,
      invoiceNumber: invoice.number || undefined,
      amountCents,
      currency: (invoice.currency || "usd").toLowerCase(),
      status,
      billingReason: invoice.billing_reason || undefined,
      paidAt: invoicePaidAt(invoice),
    },
  });
}

/** Pull paid Stripe invoices into the local ledger (deduped by stripeInvoiceId). */
export async function syncSubscriptionPaymentsFromStripe(limit = 100) {
  if (!isStripeConfigured()) return { synced: 0, stripeConfigured: false as const };
  const stripe = getStripe();
  let synced = 0;
  let startingAfter: string | undefined;
  let remaining = Math.max(1, Math.min(limit, 200));

  while (remaining > 0) {
    const pageSize = Math.min(remaining, 100);
    const page = await stripe.invoices.list({
      status: "paid",
      limit: pageSize,
      starting_after: startingAfter,
      expand: ["data.payment_intent"],
    });
    if (!page.data.length) break;
    for (const invoice of page.data) {
      const saved = await recordSubscriptionPaymentFromInvoice(invoice);
      if (saved) synced += 1;
    }
    if (!page.has_more) break;
    startingAfter = page.data[page.data.length - 1]!.id;
    remaining -= page.data.length;
  }

  return { synced, stripeConfigured: true as const };
}

function pctChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function bucketKey(date: Date, mode: "day" | "month") {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  if (mode === "month") return `${y}-${m}`;
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getAdminEarnings(input: {
  range?: string;
  from?: string;
  to?: string;
  q?: string;
  planId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sync?: boolean;
}) {
  const range = resolveEarningsRange(input);
  const stripeConfigured = isStripeConfigured();
  let syncResult: { synced: number; stripeConfigured: boolean } | null = null;

  if (input.sync === true && stripeConfigured) {
    try {
      syncResult = await syncSubscriptionPaymentsFromStripe(100);
    } catch (error) {
      console.error(
        "[earnings] Stripe invoice sync failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const paidWhere = {
    status: "PAID" as const,
    paidAt: { gte: range.start, lte: range.end },
  };
  const previousPaidWhere = {
    status: "PAID" as const,
    paidAt: { gte: range.previousStart, lte: range.previousEnd },
  };

  const [
    currentAgg,
    previousAgg,
    activeSubscriptions,
    pastDueSubscriptions,
    paidRows,
    previousPaidCount,
    plans,
  ] = await Promise.all([
    prisma.subscriptionPayment.aggregate({
      where: paidWhere,
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.subscriptionPayment.aggregate({
      where: previousPaidWhere,
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.subscription.count({ where: { status: { in: ["ACTIVE", "TRIALING"] } } }),
    prisma.subscription.findMany({
      where: { status: "PAST_DUE" },
      select: { amountCents: true, currency: true },
    }),
    prisma.subscriptionPayment.findMany({
      where: paidWhere,
      orderBy: { paidAt: "asc" },
      select: {
        amountCents: true,
        currency: true,
        paidAt: true,
        planId: true,
      },
    }),
    prisma.subscriptionPayment.count({ where: previousPaidWhere }),
    prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: "asc" }, { amountCents: "asc" }],
      include: {
        subscriptions: {
          where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
          select: { id: true },
        },
      },
    }),
  ]);

  const currency =
    paidRows[0]?.currency ||
    pastDueSubscriptions[0]?.currency ||
    plans[0]?.currency ||
    "usd";

  const totalRevenueCents = currentAgg._sum.amountCents || 0;
  const previousRevenueCents = previousAgg._sum.amountCents || 0;
  const outstandingCents = pastDueSubscriptions.reduce((sum, row) => sum + row.amountCents, 0);

  const spanMs = range.end.getTime() - range.start.getTime();
  const chartMode: "day" | "month" = spanMs > 1000 * 60 * 60 * 24 * 45 ? "month" : "day";
  const chartMap = new Map<string, number>();
  for (const row of paidRows) {
    const key = bucketKey(row.paidAt, chartMode);
    chartMap.set(key, (chartMap.get(key) || 0) + row.amountCents);
  }
  const chart = Array.from(chartMap.entries()).map(([period, amountCents]) => ({
    period,
    amountCents,
    amountLabel: formatMoney(amountCents, currency),
  }));

  const revenueByPlanId = new Map<string, number>();
  for (const row of paidRows) {
    if (!row.planId) continue;
    revenueByPlanId.set(row.planId, (revenueByPlanId.get(row.planId) || 0) + row.amountCents);
  }

  const planBreakdown = plans.map((plan) => {
    const collectedCents = revenueByPlanId.get(plan.id) || 0;
    return {
      planId: plan.id,
      planName: plan.name,
      billingCycle: plan.billingCycle,
      billingCycleLabel: plan.billingCycle === "YEARLY" ? "Yearly" : "Monthly",
      priceCents: plan.amountCents,
      priceLabel: formatMoney(plan.amountCents, plan.currency),
      subscriberCount: plan.subscriptions.length,
      collectedCents,
      collectedLabel: formatMoney(collectedCents, plan.currency || currency),
      isActive: plan.isActive,
    };
  });

  const monthlyPlans = planBreakdown.filter((p) => p.billingCycle === "MONTHLY");
  const yearlyPlans = planBreakdown.filter((p) => p.billingCycle === "YEARLY");

  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(input.pageSize) || 10));
  const paymentAnd: object[] = [
    { paidAt: { gte: range.start, lte: range.end } },
  ];
  if (input.status && input.status !== "all") {
    paymentAnd.push({ status: input.status });
  } else {
    paymentAnd.push({ status: { in: ["PAID", "REFUNDED"] } });
  }
  if (input.planId) paymentAnd.push({ planId: input.planId });
  if (input.q?.trim()) {
    const q = input.q.trim();
    paymentAnd.push({
      OR: [
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { stripeInvoiceId: { contains: q, mode: "insensitive" } },
        { stripeSubscriptionId: { contains: q, mode: "insensitive" } },
        { subscription: { user: { fullName: { contains: q, mode: "insensitive" } } } },
        { subscription: { user: { email: { contains: q, mode: "insensitive" } } } },
        { subscription: { user: { reference: { contains: q, mode: "insensitive" } } } },
        { subscription: { plan: { name: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  const where = { AND: paymentAnd };
  const [totalRows, detailRows] = await Promise.all([
    prisma.subscriptionPayment.count({ where }),
    prisma.subscriptionPayment.findMany({
      where,
      include: {
        subscription: {
          include: {
            user: { select: { id: true, fullName: true, email: true, reference: true } },
            plan: true,
          },
        },
      },
      orderBy: { paidAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const doctorIds = [
    ...new Set(
      detailRows
        .map((row) => row.userId || row.subscription?.userId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const orphanPlanIds = [
    ...new Set(
      detailRows
        .filter((row) => !row.subscription?.plan && row.planId)
        .map((row) => row.planId!)
        .filter(Boolean),
    ),
  ];
  const orphanUserIds = [
    ...new Set(
      detailRows
        .filter((row) => !row.subscription?.user && row.userId)
        .map((row) => row.userId!)
        .filter(Boolean),
    ),
  ];
  const [clinics, orphanPlans, orphanUsers] = await Promise.all([
    doctorIds.length
      ? prisma.doctorProfile.findMany({
          where: { userId: { in: doctorIds } },
          select: { userId: true, clinic: true },
        })
      : Promise.resolve([]),
    orphanPlanIds.length
      ? prisma.subscriptionPlan.findMany({ where: { id: { in: orphanPlanIds } } })
      : Promise.resolve([]),
    orphanUserIds.length
      ? prisma.user.findMany({
          where: { id: { in: orphanUserIds } },
          select: { id: true, fullName: true, email: true, reference: true },
        })
      : Promise.resolve([]),
  ]);
  const clinicByUser = new Map(clinics.map((row) => [row.userId, row.clinic]));
  const planById = new Map(orphanPlans.map((row) => [row.id, row]));
  const userById = new Map(orphanUsers.map((row) => [row.id, row]));

  const payments = detailRows.map((row) => {
    const user = row.subscription?.user || (row.userId ? userById.get(row.userId) : undefined);
    const plan =
      row.subscription?.plan || (row.planId ? planById.get(row.planId) : undefined);
    const doctorName = user?.fullName || "Unknown doctor";
    const clinic = (user && clinicByUser.get(user.id)?.trim()) || "";
    return {
      id: row.id,
      doctorName,
      clinic,
      doctorEmail: user?.email || null,
      doctorReference: user?.reference || null,
      planName: plan?.name || "—",
      billingCycle: plan?.billingCycle || null,
      billingCycleLabel: plan
        ? plan.billingCycle === "YEARLY"
          ? "Yearly"
          : "Monthly"
        : "—",
      paymentDate: row.paidAt.toISOString(),
      amountCents: row.amountCents,
      amountLabel: formatMoney(row.amountCents, row.currency),
      currency: row.currency,
      status: row.status,
      statusLabel:
        row.status === "PAID" ? "Paid" : row.status === "REFUNDED" ? "Refunded" : "Failed",
      invoiceReference: row.invoiceNumber || row.stripeInvoiceId,
      stripeInvoiceId: row.stripeInvoiceId,
      stripeSubscriptionId: row.stripeSubscriptionId,
      subscriptionId: row.subscriptionId,
    };
  });

  const canCompare =
    previousPaidCount > 0 && (previousAgg._sum.amountCents || 0) > 0;

  return {
    stripeConfigured,
    sync: syncResult,
    currency,
    range: {
      key: input.range || "this_month",
      label: range.label,
      start: range.start.toISOString(),
      end: range.end.toISOString(),
    },
    summary: {
      totalRevenueCents,
      totalRevenueLabel: formatMoney(totalRevenueCents, currency),
      totalRevenueChangePct: canCompare ? pctChange(totalRevenueCents, previousRevenueCents) : null,
      subscriptionPaymentsCents: totalRevenueCents,
      subscriptionPaymentsLabel: formatMoney(totalRevenueCents, currency),
      subscriptionPaymentsChangePct: canCompare
        ? pctChange(totalRevenueCents, previousRevenueCents)
        : null,
      outstandingCents,
      outstandingLabel: formatMoney(outstandingCents, currency),
      outstandingSupported: true,
      outstandingNote: "Sum of past-due subscription plan amounts currently on file.",
      activeSubscriptions,
      paidPaymentCount: currentAgg._count._all,
      previousPaidPaymentCount: previousPaidCount,
    },
    chart: {
      mode: chartMode,
      points: chart,
    },
    planBreakdown,
    billingIntervalTotals: {
      monthlyCollectedCents: monthlyPlans.reduce((s, p) => s + p.collectedCents, 0),
      yearlyCollectedCents: yearlyPlans.reduce((s, p) => s + p.collectedCents, 0),
      monthlySubscribers: monthlyPlans.reduce((s, p) => s + p.subscriberCount, 0),
      yearlySubscribers: yearlyPlans.reduce((s, p) => s + p.subscriberCount, 0),
    },
    payments: {
      rows: payments,
      page,
      pageSize,
      total: totalRows,
      totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
    },
    empty:
      currentAgg._count._all === 0 &&
      pastDueSubscriptions.length === 0 &&
      activeSubscriptions === 0,
  };
}
