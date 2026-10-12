/** Same-origin app routes (landing + system share one server). */
export const SIGN_IN_URL = "/login"
export const SIGN_UP_URL = "/signup"

export type LandingPlanSlug = "starter" | "growth" | "pilot"
export type LandingBillingCycle = "monthly" | "yearly"

/** Signup URL that carries the chosen plan into onboarding → Stripe checkout. */
export function planSignupUrl(plan: LandingPlanSlug, cycle: LandingBillingCycle) {
  const billing = plan === "pilot" ? "yearly" : cycle
  const params = new URLSearchParams({ plan, cycle: billing })
  return `${SIGN_UP_URL}?${params.toString()}`
}
