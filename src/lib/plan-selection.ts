export type PlanSlug = "starter" | "growth" | "pilot";
export type BillingCycleSlug = "monthly" | "yearly";

export const PENDING_PLAN_KEY = "ai-receptionist-pending-plan";

const PLAN_ALIASES: Record<PlanSlug, string[]> = {
  starter: ["starter"],
  growth: ["growth", "professional"],
  pilot: ["pilot"],
};

/** Landing stores the chosen plan so Stripe checkout can open after signup. */
export function readPendingPlan(): { plan: PlanSlug; cycle: BillingCycleSlug } | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = sessionStorage.getItem(PENDING_PLAN_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { plan?: unknown; cycle?: unknown };
    const plan = parsePlanSlug(parsed.plan);
    const cycle = parseBillingCycleSlug(parsed.cycle) ?? "monthly";
    if (!plan) return undefined;
    return { plan, cycle: plan === "pilot" ? "yearly" : cycle };
  } catch {
    return undefined;
  }
}

export function clearPendingPlan() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_PLAN_KEY);
  } catch {
    /* ignore */
  }
}

export function parsePlanSlug(value: unknown): PlanSlug | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  if (key === "starter" || key === "growth" || key === "pilot") return key;
  if (key === "professional") return "growth";
  return undefined;
}

export function parseBillingCycleSlug(value: unknown): BillingCycleSlug | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  if (key === "monthly" || key === "month") return "monthly";
  if (key === "yearly" || key === "year" || key === "annual") return "yearly";
  return undefined;
}

export function findMatchingPlanId<
  T extends { id: string; name: string; billingCycle: string },
>(plans: T[], plan: PlanSlug, cycle: BillingCycleSlug): T | undefined {
  const aliases = PLAN_ALIASES[plan];
  const cycleKey = cycle === "yearly" ? "YEARLY" : "MONTHLY";
  const exact = plans.find(
    (row) =>
      aliases.some((alias) => row.name.trim().toLowerCase() === alias) &&
      row.billingCycle === cycleKey,
  );
  if (exact) return exact;
  // Pilot is yearly-only — fall back to any Pilot row.
  if (plan === "pilot") {
    return plans.find((row) => aliases.some((alias) => row.name.trim().toLowerCase() === alias));
  }
  return undefined;
}
