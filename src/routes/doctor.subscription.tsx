import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { doctorSubscriptionApi, formatApiError, type ApiSubscription, type ApiSubscriptionPlan } from "@/lib/api";

export const Route = createFileRoute("/doctor/subscription")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: typeof search.checkout === "string" ? search.checkout : undefined,
  }),
  head: () => ({
    meta: [{ title: "Plans — Doctor portal" }],
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
      setError(formatApiError(err, "Unable to load plans."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (search.checkout === "success") {
      setNotice("Checkout complete. Your plan status will update shortly.");
    }
    if (search.checkout === "cancelled") {
      setError("Checkout was cancelled. You can choose a plan again when you are ready.");
    }
  }, [search.checkout]);

  const planActive =
    subscription != null && ["ACTIVE", "TRIALING"].includes(subscription.status);

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
        title="Your plans"
        description={
          planActive
            ? "Your plan is active. Billing and renewal dates stay in sync with Stripe."
            : "Compare plans below and choose the one that fits your clinic."
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-primary">{notice}</p> : null}

      {loading ? (
        <EmptyNote>Loading plans…</EmptyNote>
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
              <p className="mt-3 text-sm text-muted-foreground">
                You do not have a plan yet. Select one below to continue.
              </p>
            )}
          </Panel>

          {!plans.length ? (
            <EmptyNote>No plans are available yet. Super Admin can publish them from Billing.</EmptyNote>
          ) : (
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => {
                const current = subscription?.planId === plan.id && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(subscription.status);
                return (
                  <Panel
                    key={plan.id}
                    className={cn(
                      "flex flex-col p-5 ring-1 ring-slate-300",
                      current && "ring-2 ring-blue-500",
                    )}
                  >
                    <p className="text-sm font-semibold">{plan.name}</p>
                    <p className="mt-1 text-2xl font-semibold">{plan.amountLabel}</p>
                    <p className="text-xs text-muted-foreground">per {plan.billingCycleLabel.toLowerCase().replace("ly", "")}</p>
                    <p className="mt-3 text-sm text-muted-foreground">{plan.description || "Clinic plan"}</p>
                    <ul className="mt-4 flex-1 space-y-2.5 text-sm">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <span
                            className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-white"
                            style={{ background: "linear-gradient(135deg, #10B981, #059669)" }}
                          >
                            <Check className="size-2.5" strokeWidth={3} />
                          </span>
                          <span className="leading-snug text-foreground">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="mt-5"
                      disabled={Boolean(busyId) || current}
                      onClick={() => void startCheckout(plan.id)}
                    >
                      {current ? "Current plan" : busyId === plan.id ? "Redirecting…" : "Choose plan"}
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
