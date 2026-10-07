import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Button,
  EmptyNote,
  PageHeader,
  Panel,
  Badge,
  SectionLabel,
} from "@/components/ui/primitives";
import { doctorSubscriptionApi, formatApiError, type ApiSubscriptionPlan } from "@/lib/api";
import {
  Stethoscope,
  Star,
  PhoneCall,
  Shield,
  ArrowRight,
  Sparkles,
  Zap,
  Crown,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/doctor/onboarding")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: search["checkout"] === "cancelled" ? ("cancelled" as const) : undefined,
    payment: search["payment"] === "failed" ? ("failed" as const) : undefined,
  }),
  head: () => ({
    meta: [{ title: "Choose a plan — Doctor onboarding" }],
  }),
  component: DoctorOnboardingPage,
});

function DoctorOnboardingPage() {
  const search = Route.useSearch();
  const [plans, setPlans] = useState<ApiSubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const catalog = await doctorSubscriptionApi.listPlans();
        if (cancelled) return;
        setPlans(catalog.plans.filter((plan) => plan.isActive));
        if (!catalog.stripeConfigured) {
          setError("Billing is not configured yet. Ask Super Admin to add the Stripe keys.");
        }
      } catch (err) {
        if (!cancelled) setError(formatApiError(err, "Unable to load subscription plans."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (search.checkout === "cancelled") {
      setError("Payment was cancelled. Your account stays inactive until a plan is paid.");
    }
    if (search.payment === "failed") {
      setError("Payment did not complete. Choose a plan and try checkout again.");
    }
  }, [search.checkout, search.payment]);

  async function startCheckout(planId: string) {
    setBusyId(planId);
    setError("");
    try {
      const result = await doctorSubscriptionApi.checkout(planId, window.location.origin);
      window.location.assign(result.checkout.url);
    } catch (err) {
      setError(formatApiError(err, "Unable to start Stripe checkout."));
      setBusyId("");
    }
  }

  type PlanStyle = {
    gradient: string;
    border: string;
    badge: { tone: "info" | "primary" | "accent"; label: string };
    icon: React.ReactNode;
    iconBg: { background: string; boxShadow: string };
    featured: boolean;
  };
  const planStyles: PlanStyle[] = [
    {
      gradient: "linear-gradient(180deg, #FFFFFF 0%, #F0F9FF 100%)",
      border: "1px solid #E0F2FE",
      badge: { tone: "info", label: "STARTER" },
      icon: <Zap className="size-5" strokeWidth={2.3} />,
      iconBg: {
        background: "linear-gradient(135deg, #0EA5E9, #0284C7)",
        boxShadow: "0 8px 20px -6px rgba(14, 165, 233, 0.55)",
      },
      featured: false,
    },
    {
      gradient: "linear-gradient(180deg, #FFFFFF 0%, #EEF4FF 40%, #E0EBFF 100%)",
      border: "2px solid #2563EB",
      badge: { tone: "primary", label: "MOST POPULAR" },
      icon: <Sparkles className="size-5" strokeWidth={2.3} />,
      iconBg: {
        background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
        boxShadow: "0 10px 24px -8px rgba(37, 99, 235, 0.6)",
      },
      featured: true,
    },
    {
      gradient: "linear-gradient(180deg, #FFFFFF 0%, #FAF5FF 100%)",
      border: "1px solid #F3E8FF",
      badge: { tone: "accent", label: "ENTERPRISE" },
      icon: <Crown className="size-5" strokeWidth={2.3} />,
      iconBg: {
        background: "linear-gradient(135deg, #8B5CF6, #7C3AED)",
        boxShadow: "0 10px 24px -8px rgba(139, 92, 246, 0.6)",
      },
      featured: false,
    },
  ];

  return (
    <>
      <div className="mb-8">
        <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
          <div
            className="inline-flex items-center gap-2.5 rounded-full px-4.5 py-2 mb-5"
            style={{
              background:
                "linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.06))",
              border: "1px solid rgba(59, 130, 246, 0.2)",
            }}
          >
            <Stethoscope className="size-4.5" strokeWidth={2.4} style={{ color: "#1D4ED8" }} />
            <span className="text-[11.5px] font-extrabold uppercase tracking-[0.16em] text-blue-700">
              Doctor onboarding · Step 2 of 3
            </span>
          </div>
          <h1
            className="font-[--font-display] font-extrabold tracking-tight text-foreground text-balance"
            style={{
              fontSize: "clamp(1.8rem, 4vw, 2.5rem)",
              letterSpacing: "-0.03em",
            }}
          >
            Choose your subscription plan
          </h1>
          <p
            className="mt-3 text-[15px] leading-relaxed max-w-xl text-balance"
            style={{ color: "#64748B" }}
          >
            Your account is created. Pick a plan that fits your practice size, then pay securely
            with Stripe. The full clinic dashboard opens the moment your payment succeeds.
          </p>

          <div className="mt-7 flex items-center gap-2 w-full max-w-md">
            {[
              { n: 1, label: "Account", done: true },
              { n: 2, label: "Plan", active: true },
              { n: 3, label: "Profile" },
            ].map((step, i, arr) => (
              <div key={step.n} className="flex items-center gap-2 flex-1">
                <div
                  className="grid size-10 place-items-center rounded-xl text-[13px] font-extrabold transition-all shrink-0"
                  style={{
                    background: step.done
                      ? "linear-gradient(135deg, #10B981, #059669)"
                      : step.active
                        ? "linear-gradient(135deg, #2563EB, #1D4ED8)"
                        : "linear-gradient(135deg, #F1F5F9, #E2E8F0)",
                    color: step.done || step.active ? "#FFFFFF" : "#94A3B8",
                    boxShadow: step.active ? "0 6px 18px -5px rgba(37, 99, 235, 0.55)" : "none",
                  }}
                >
                  {step.done ? <CheckCircle2 className="size-5" strokeWidth={3} /> : step.n}
                </div>
                <span
                  className="hidden sm:block text-[12px] font-bold truncate"
                  style={{
                    color: step.done || step.active ? "#0F172A" : "#94A3B8",
                  }}
                >
                  {step.label}
                </span>
                {i < arr.length - 1 ? (
                  <div
                    className="flex-1 h-1 rounded-full"
                    style={{
                      background: step.done
                        ? "linear-gradient(90deg, #10B981, #2563EB)"
                        : "#E2E8F0",
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div
          className="mb-6 mx-auto max-w-3xl rounded-2xl p-4.5 text-[13.5px] font-semibold"
          style={{
            background: "linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.02))",
            borderLeft: "4px solid #EF4444",
            color: "#DC2626",
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <EmptyNote>Loading plans…</EmptyNote>
      ) : !plans.length ? (
        <EmptyNote>
          No active subscription plans are available. Super Admin can publish them under
          Subscriptions.
        </EmptyNote>
      ) : (
        <div className="grid gap-5 md:grid-cols-3 max-w-6xl mx-auto">
          {plans.map((plan, idx) => {
            const safeIdx = Math.min(idx, planStyles.length - 1);
            const style = planStyles[safeIdx]!;
            return (
              <div
                key={plan.id}
                className={
                  "relative rounded-3xl p-7 transition-all duration-300 hover:-translate-y-1.5 flex flex-col"
                }
                style={{
                  background: style.gradient,
                  border: style.border,
                  boxShadow: style.featured
                    ? "0 30px 60px -24px rgba(37, 99, 235, 0.45), 0 1px 2px rgba(15,23,42,0.04)"
                    : "0 20px 40px -24px rgba(15,23,42,0.18), 0 1px 2px rgba(15,23,42,0.04)",
                }}
              >
                {style.featured ? (
                  <div
                    className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white"
                    style={{
                      background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 55%, #1E40AF 100%)",
                      boxShadow: "0 10px 20px -8px rgba(37, 99, 235, 0.65)",
                    }}
                  >
                    <Star className="size-3.5" fill="currentColor" />
                    {style.badge.label}
                  </div>
                ) : (
                  <Badge
                    tone={style.badge.tone}
                    className="px-3.5 py-1 rounded-full text-[10.5px] mb-1"
                    dot
                  >
                    {style.badge.label}
                  </Badge>
                )}

                <div className="mt-2">
                  <div
                    className="grid size-14 place-items-center rounded-2xl text-white mb-5"
                    style={style.iconBg}
                  >
                    {style.icon}
                  </div>
                  <h3 className="font-[--font-display] text-[1.4rem] font-extrabold tracking-tight text-foreground">
                    {plan.name}
                  </h3>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span
                      className="font-[--font-display] font-extrabold tracking-tight text-foreground"
                      style={{ fontSize: "2.5rem", letterSpacing: "-0.03em" }}
                    >
                      {plan.amountLabel}
                    </span>
                    <span className="text-[13px] font-semibold text-muted-foreground">
                      / {plan.billingCycleLabel.toLowerCase().replace("ly", "")}
                    </span>
                  </div>
                  {plan.trialDays > 0 ? (
                    <Badge tone="success" className="mt-2 px-3 py-1 rounded-full text-[10.5px]" dot>
                      {plan.trialDays}-day free trial
                    </Badge>
                  ) : null}
                </div>

                <p className="mt-4 text-[13.5px] leading-relaxed" style={{ color: "#64748B" }}>
                  {plan.description || "Clinic subscription plan"}
                </p>

                <div className="mt-6 pt-6 border-t border-border/70 flex-1">
                  <SectionLabel className="text-[10.5px]">Everything included</SectionLabel>
                  <ul className="mt-3.5 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <span
                          className="grid size-5 shrink-0 place-items-center rounded-full mt-0.5"
                          style={{
                            background:
                              "linear-gradient(135deg, rgba(16, 185, 129, 0.18), rgba(16, 185, 129, 0.06))",
                            color: "#059669",
                          }}
                        >
                          <CheckCircle2 className="size-3.5" strokeWidth={3.2} />
                        </span>
                        <span className="text-[13px] font-semibold text-foreground leading-snug">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-7 grid grid-cols-3 gap-2 pb-6">
                  {[
                    {
                      i: <Stethoscope className="size-4" strokeWidth={2.3} />,
                      l: "Unlimited patients",
                    },
                    { i: <PhoneCall className="size-4" strokeWidth={2.3} />, l: "AI voice calls" },
                    { i: <Shield className="size-4" strokeWidth={2.3} />, l: "HIPAA secure" },
                  ].map((b, bi) => (
                    <div
                      key={bi}
                      className="rounded-xl p-2.5 text-center flex flex-col items-center gap-1.5 bg-white/70 border border-border/50"
                    >
                      <span style={{ color: "#1D4ED8" }}>{b.i}</span>
                      <span className="text-[9.5px] font-bold leading-tight text-muted-foreground">
                        {b.l}
                      </span>
                    </div>
                  ))}
                </div>

                <Button
                  size="lg"
                  className="w-full rounded-2xl text-[14px]"
                  disabled={Boolean(busyId)}
                  onClick={() => void startCheckout(plan.id)}
                >
                  {busyId === plan.id ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin size-4.5" viewBox="0 0 24 24" fill="none">
                        <circle
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                          className="opacity-25"
                        />
                        <path
                          fill="currentColor"
                          className="opacity-75"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Opening checkout…
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      Continue to checkout
                      <ArrowRight className="size-4.5" strokeWidth={2.3} />
                    </span>
                  )}
                </Button>
                <p className="mt-3 text-center text-[11.5px] font-semibold text-muted-foreground">
                  Secure Stripe checkout · Cancel anytime
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div
        className="mt-10 max-w-4xl mx-auto rounded-3xl p-7 text-center"
        style={{
          background:
            "linear-gradient(135deg, rgba(59, 130, 246, 0.06) 0%, rgba(139, 92, 246, 0.04) 100%)",
          border: "1px solid rgba(59, 130, 246, 0.16)",
        }}
      >
        <h4 className="font-[--font-display] text-[1.15rem] font-extrabold tracking-tight text-foreground">
          Not sure which plan fits?
        </h4>
        <p
          className="mt-2 text-[13.5px] max-w-xl mx-auto leading-relaxed"
          style={{ color: "#64748B" }}
        >
          Start with Professional — it's our most popular choice for growing clinics. Upgrade or
          downgrade anytime, no questions asked.
        </p>
      </div>
    </>
  );
}
