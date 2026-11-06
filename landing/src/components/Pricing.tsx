import { useState } from "react"
import { Check } from "lucide-react"
import { openStripeCheckoutForPlan, type LandingPlanSlug } from "../lib/app"

type Period = "monthly" | "yearly"

type Plan = {
  slug: LandingPlanSlug
  name: string
  forText: string
  badge?: string
  badgeOutline?: boolean
  featured?: boolean
  pilot?: boolean
  cta: string
  monthly: { amt: string; per: string; sub: string }
  yearly: { amt: string; per: string; sub: string }
  includes?: string
  features: string[]
}

const plans: Plan[] = [
  {
    slug: "starter",
    name: "Starter",
    forText: "Best for solo clinics getting started.",
    cta: "Choose Starter",
    monthly: { amt: "$299", per: "/month", sub: "Billed monthly" },
    yearly: { amt: "$2,990", per: "/year", sub: "Billed yearly · about $249/month" },
    features: [
      "AI phone receptionist",
      "Appointment booking from real availability",
      "SMS OTP confirmation",
      "Doctor dashboard",
      "Appointments management",
      "Patient list",
      "Basic medical records and reports",
      "Automated appointment reminders",
      "SMS notifications",
      "Availability calendar",
      "Stripe plan billing",
    ],
  },
  {
    slug: "growth",
    name: "Growth",
    forText: "Best for established clinics.",
    badge: "Most popular",
    featured: true,
    cta: "Choose Growth",
    monthly: { amt: "$599", per: "/month", sub: "Billed monthly" },
    yearly: { amt: "$5,990", per: "/year", sub: "Billed yearly · about $499/month" },
    includes: "Everything in Starter, plus",
    features: [
      "Follow-up scheduling",
      "Patient timeline with clinical notes and prescriptions",
      "Medical record upload requests via SMS",
      "Appointment invoice links (Stripe)",
      "Clinic team users with permissions",
      "Activity history and richer notifications",
      "My Clinic phone AI configuration (greeting, language, voice, sync)",
      "Advanced practice dashboard workflows",
    ],
  },
  {
    slug: "pilot",
    name: "Pilot",
    forText: "Growth for 1 year at a locked rate.",
    badge: "Locked rate",
    badgeOutline: true,
    pilot: true,
    cta: "Start Pilot",
    monthly: {
      amt: "$400",
      per: "/month",
      sub: "$400/month rate locked for one year · billed $4,800 yearly",
    },
    yearly: {
      amt: "$4,800",
      per: "/year",
      sub: "Billed $4,800 yearly · $400/month rate locked for one year",
    },
    includes: "Same Growth experience · rate locked for 12 months",
    features: [
      "All Growth capabilities",
      "Locked $400/month rate for 1 year",
      "Billed $4,800 yearly",
      "Ideal for clinics piloting AI Receptionist with full Growth workflows",
    ],
  },
]

export default function Pricing() {
  const [period, setPeriod] = useState<Period>("monthly")
  const [busySlug, setBusySlug] = useState("")
  const [error, setError] = useState("")

  async function choosePlan(slug: LandingPlanSlug) {
    setError("")
    setBusySlug(slug)
    try {
      await openStripeCheckoutForPlan(slug, period)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open Stripe checkout.")
      setBusySlug("")
    }
  }

  return (
    <section className="pricing-section" id="pricing">
      <div className="container">
        <div className="pricing-header" id="pricing-header">
          <h2 className="section-title section-title-lg pricing-title">
            Simple plans for growing clinics
          </h2>
          <p className="section-description pricing-subtitle">
            Monthly or yearly billing. Upgrade when your clinic is ready.
          </p>
          <div className="pricing-toggle" id="pricing-toggle">
            <button
              type="button"
              className={`toggle-btn${period === "monthly" ? " active" : ""}`}
              onClick={() => setPeriod("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`toggle-btn${period === "yearly" ? " active" : ""}`}
              onClick={() => setPeriod("yearly")}
            >
              Yearly
            </button>
          </div>
        </div>

        {error ? (
          <p className="section-description" style={{ color: "#DC2626", textAlign: "center", marginBottom: 24 }}>
            {error}
          </p>
        ) : null}

        <div className="pricing-grid" id="pricing-grid">
          {plans.map((plan) => {
            const price = period === "yearly" ? plan.yearly : plan.monthly
            const cardClass = [
              "pricing-card",
              plan.featured ? "pricing-card-featured" : "",
              plan.pilot ? "pricing-card-pilot" : "",
            ]
              .filter(Boolean)
              .join(" ")
            const busy = busySlug === plan.slug
            const stroke = plan.featured ? "currentColor" : "#0D2C94"

            return (
              <div className={cardClass} id={`pricing-${plan.slug}`} key={plan.slug}>
                {plan.badge ? (
                  <div className={`plan-badge${plan.badgeOutline ? " plan-badge-outline" : ""}`}>
                    {plan.badge}
                  </div>
                ) : null}
                <div className="pricing-card-header">
                  <h3 className="plan-name">{plan.name}</h3>
                  <p className="plan-tagline">{plan.forText}</p>
                  <div className="plan-price">
                    <span className="price-amount">{price.amt}</span>
                    <span className="price-period">{price.per}</span>
                  </div>
                  <p className="price-billing">{price.sub}</p>
                </div>
                <div className="plan-divider" />
                {plan.includes ? (
                  <p className="plan-includes">
                    <strong>{plan.includes}</strong>
                  </p>
                ) : null}
                <ul className="plan-features">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check className="check-icon" size={18} strokeWidth={2.5} color={stroke} aria-hidden />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`btn ${plan.featured || plan.pilot ? "btn-primary" : "btn-outline"} btn-plan`}
                  disabled={Boolean(busySlug)}
                  onClick={() => void choosePlan(plan.slug)}
                >
                  {busy ? "Opening Stripe…" : plan.cta}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
