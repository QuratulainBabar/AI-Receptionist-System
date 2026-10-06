import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button, EmptyNote, PageHeader, Panel } from "@/components/ui/primitives";
import { doctorSubscriptionApi, formatApiError, type ApiSubscriptionPlan } from "@/lib/api";

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

  return (
    <>
      <PageHeader
        eyebrow="Doctor onboarding"
        title="Choose a subscription plan"
        description="Your account is created. Pick an active plan from Super Admin, then pay with Stripe. The clinic dashboard opens after payment succeeds."
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <EmptyNote>Loading plans…</EmptyNote>
      ) : !plans.length ? (
        <EmptyNote>No active subscription plans are available. Super Admin can publish them under Subscriptions.</EmptyNote>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <Panel key={plan.id} className="flex flex-col p-5">
              <p className="text-sm font-semibold">{plan.name}</p>
              <p className="mt-1 text-2xl font-semibold">{plan.amountLabel}</p>
              <p className="text-xs text-muted-foreground">per {plan.billingCycleLabel.toLowerCase().replace("ly", "")}</p>
              {plan.trialDays > 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">{plan.trialDays}-day trial</p>
              ) : null}
              <p className="mt-3 text-sm text-muted-foreground">{plan.description || "Clinic subscription plan"}</p>
              <ul className="mt-4 flex-1 space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Button className="mt-5" disabled={Boolean(busyId)} onClick={() => void startCheckout(plan.id)}>
                {busyId === plan.id ? "Opening checkout…" : "Continue to checkout"}
              </Button>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
