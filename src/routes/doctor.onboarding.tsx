import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  parseBillingCycleSlug,
  parsePlanSlug,
  readPendingPlan,
} from "@/lib/plan-selection";
import { startStripeCheckoutForPlan } from "@/lib/stripe-checkout";
import { formatApiError } from "@/lib/api";

/**
 * Silent Stripe launcher — plan cards UI removed.
 * Landing plan → signup → here only long enough to open Stripe Checkout.
 */
export const Route = createFileRoute("/doctor/onboarding")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: search["checkout"] === "cancelled" ? ("cancelled" as const) : undefined,
    payment: search["payment"] === "failed" ? ("failed" as const) : undefined,
    plan: parsePlanSlug(search.plan),
    cycle: parseBillingCycleSlug(search.cycle),
  }),
  head: () => ({
    meta: [{ title: "Opening checkout — AI Receptionist" }],
  }),
  component: DoctorOnboardingLauncher,
});

function DoctorOnboardingLauncher() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Opening Stripe checkout…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (search.checkout === "cancelled" || search.payment === "failed") {
      window.location.assign("/#pricing");
      return;
    }

    const pending = search.plan
      ? { plan: search.plan, cycle: search.cycle ?? ("monthly" as const) }
      : readPendingPlan();

    if (!pending?.plan) {
      window.location.assign("/#pricing");
      return;
    }

    void (async () => {
      try {
        const url = await startStripeCheckoutForPlan(pending.plan, pending.cycle);
        window.location.assign(url);
      } catch (err) {
        setMessage(formatApiError(err, "Unable to start Stripe checkout."));
        window.setTimeout(() => {
          window.location.assign("/#pricing");
        }, 1800);
      }
    })();
  }, [navigate, search.checkout, search.cycle, search.payment, search.plan]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
