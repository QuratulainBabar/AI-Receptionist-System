import { doctorSubscriptionApi } from "@/lib/api";
import {
  clearPendingPlan,
  findMatchingPlanId,
  type BillingCycleSlug,
  type PlanSlug,
} from "@/lib/plan-selection";

/** Start Stripe Checkout for a landing plan. Returns the hosted checkout URL. */
export async function startStripeCheckoutForPlan(
  plan: PlanSlug,
  cycle: BillingCycleSlug,
): Promise<string> {
  const catalog = await doctorSubscriptionApi.listPlans();
  if (!catalog.stripeConfigured) {
    throw new Error("Billing is not configured yet. Ask Super Admin to add the Stripe keys.");
  }
  const match = findMatchingPlanId(
    catalog.plans.filter((row) => row.isActive),
    plan,
    cycle,
  );
  if (!match) {
    throw new Error(
      `No matching ${plan} (${cycle}) plan is available yet. Choose a plan on the pricing page.`,
    );
  }
  const result = await doctorSubscriptionApi.checkout(match.id, window.location.origin);
  clearPendingPlan();
  return result.checkout.url;
}
