import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { doctorSubscriptionApi, formatApiError, type ApiSubscription, type ApiSubscriptionPlan } from "@/lib/api";

export const Route = createFileRoute("/doctor/subscription")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
  }),
  head: () => ({
    meta: [{ title: "Subscription — Doctor portal" }],
  }),
  component: DoctorSubscriptionPage,
});

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function DoctorSubscriptionPage() {
  const search = Route.useSearch();
  const [plans, setPlans] = useState<ApiSubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<ApiSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [mine, catalog] = await Promise.all([
        doctorSubscriptionApi.getMine(),
        doctorSubscriptionApi.listPlans(),
      ]);
      setSubscription(mine.subscription);
      setPlans(catalog.plans);
      if (!catalog.stripeConfigured) {
        setError("Billing is not configured yet. Ask Super Admin to add Stripe test keys.");
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to load subscription plans."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (search.checkout === "success") {
      setNotice("Checkout complete. Stripe will sync your subscription status shortly.");
    }
    if (search.checkout === "cancelled") {
      setError("Checkout was cancelled. You can choose a plan again when you are ready.");
    }
  }, [search.checkout]);

  async function startCheckout(planId: string) {
    setBusyId(planId);
    setError("");
    setNotice("");
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
        eyebrow="Billing"
        title="Your subscription"
        description="Your plan is active. Stripe remains the source of truth for payment and renewal dates."
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-primary">{notice}</p> : null}

      {loading ? (
        <EmptyNote>Loading your subscription…</EmptyNote>
      ) : (
        <>
          <Panel className="mb-6 p-4">
            <SectionLabel>Current plan</SectionLabel>
            {subscription ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Plan</p>
                  <p className="font-medium">{subscription.planName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-medium">
                    {subscription.amountLabel} / {subscription.billingCycleLabel.toLowerCase()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge tone={subscription.status === "ACTIVE" || subscription.status === "TRIALING" ? "success" : "warning"}>
                    {subscription.statusLabel}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Next billing</p>
                  <p className="font-medium">{formatDate(subscription.currentPeriodEnd)}</p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">You do not have a subscription yet. Select a plan below to continue.</p>
            )}
          </Panel>

          {!plans.length ? (
            <EmptyNote>No subscription plans are available. Super Admin can create them in Subscriptions.</EmptyNote>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {plans.map((plan) => {
                const current = subscription?.planId === plan.id && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(subscription.status);
                return (
                  <Panel key={plan.id} className="flex flex-col p-5">
                    <p className="text-sm font-semibold">{plan.name}</p>
                    <p className="mt-1 text-2xl font-semibold">{plan.amountLabel}</p>
                    <p className="text-xs text-muted-foreground">per {plan.billingCycleLabel.toLowerCase().replace("ly", "")}</p>
                    <p className="mt-3 text-sm text-muted-foreground">{plan.description || "Clinic subscription plan"}</p>
                    <ul className="mt-4 flex-1 space-y-2 text-sm">
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <Button
                      className="mt-5"
                      disabled={Boolean(busyId) || current}
                      onClick={() => void startCheckout(plan.id)}
                    >
                      {current ? "Current plan" : busyId === plan.id ? "Redirecting…" : "Subscribe with Stripe"}
                    </Button>
                  </Panel>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
