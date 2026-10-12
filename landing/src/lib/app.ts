/** Same-origin app routes (landing + system share one server). */
export const SIGN_IN_URL = "/login"
export const SIGN_UP_URL = "/signup"

export type LandingPlanSlug = "starter" | "growth" | "pilot"
export type LandingBillingCycle = "monthly" | "yearly"

export const PENDING_PLAN_KEY = "ai-receptionist-pending-plan"

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:4000"

function doctorToken(): string | null {
  try {
    return localStorage.getItem("ai-receptionist-token")
  } catch {
    return null
  }
}

function doctorSessionRole(): string | null {
  try {
    const raw = localStorage.getItem("ai-receptionist-session")
    if (!raw) return null
    const parsed = JSON.parse(raw) as { role?: string }
    return parsed.role || null
  } catch {
    return null
  }
}

/** Remember plan so checkout complete / signup flows can recover if needed. */
export function rememberPendingPlan(plan: LandingPlanSlug, cycle: LandingBillingCycle) {
  const billing = plan === "pilot" ? "yearly" : cycle
  try {
    sessionStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ plan, cycle: billing }))
  } catch {
    /* ignore */
  }
}

/**
 * Open Stripe Checkout for a landing plan (monthly or yearly).
 * Logged-in doctors use the authenticated checkout; everyone else uses guest checkout
 * (no /signup?plan=… redirect).
 */
export async function openStripeCheckoutForPlan(
  plan: LandingPlanSlug,
  cycle: LandingBillingCycle,
): Promise<void> {
  const billing = plan === "pilot" ? "yearly" : cycle
  rememberPendingPlan(plan, billing)

  const token = doctorToken()
  const role = doctorSessionRole()

  if (token && role === "doctor") {
    const plansRes = await fetch(`${API_BASE}/api/doctor/subscription/plans`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const plansBody = (await plansRes.json().catch(() => ({}))) as {
      success?: boolean
      plans?: Array<{ id: string; name: string; billingCycle: string; isActive: boolean }>
      message?: string
    }
    if (!plansRes.ok || !plansBody.plans) {
      throw new Error(plansBody.message || "Unable to load plans for checkout.")
    }

    const cycleKey = billing === "yearly" ? "YEARLY" : "MONTHLY"
    const aliases = plan === "growth" ? ["growth", "professional"] : [plan]
    const match = plansBody.plans.find(
      (row) =>
        row.isActive &&
        aliases.some((a) => row.name.trim().toLowerCase() === a) &&
        (plan === "pilot" || row.billingCycle === cycleKey),
    )
    if (!match) {
      throw new Error(`No matching ${plan} (${billing}) plan is available yet.`)
    }

    const checkoutRes = await fetch(`${API_BASE}/api/doctor/subscription/checkout`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ planId: match.id, returnOrigin: window.location.origin }),
    })
    const checkoutBody = (await checkoutRes.json().catch(() => ({}))) as {
      success?: boolean
      checkout?: { url?: string }
      message?: string
    }
    if (!checkoutRes.ok || !checkoutBody.checkout?.url) {
      throw new Error(checkoutBody.message || "Unable to start Stripe checkout.")
    }
    window.location.assign(checkoutBody.checkout.url)
    return
  }

  const res = await fetch(`${API_BASE}/api/billing/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan,
      cycle: billing,
      returnOrigin: window.location.origin,
    }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    success?: boolean
    checkout?: { url?: string }
    message?: string
  }
  if (!res.ok || !body.checkout?.url) {
    throw new Error(body.message || "Unable to start Stripe checkout.")
  }
  window.location.assign(body.checkout.url)
}
