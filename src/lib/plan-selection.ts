export type PlanSlug = "starter" | "growth" | "pilot";
export type BillingCycleSlug = "monthly" | "yearly";

const PLAN_ALIASES: Record<PlanSlug, string[]> = {
  starter: ["starter"],
  growth: ["growth", "professional"],
  pilot: ["pilot"],
};

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
