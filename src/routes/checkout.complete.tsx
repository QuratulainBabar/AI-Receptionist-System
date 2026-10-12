import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ApiError, formatApiError, type ApiUser } from "@/lib/api";
import { clearPendingPlan } from "@/lib/plan-selection";
import { saveAuth } from "@/lib/session";

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:4000";

export const Route = createFileRoute("/checkout/complete")({
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({
    meta: [{ title: "Completing checkout — AI Receptionist" }],
  }),
  component: CheckoutCompletePage,
});

function CheckoutCompletePage() {
  const { session_id: sessionId } = Route.useSearch();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Confirming your payment…");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!sessionId?.startsWith("cs_")) {
      setMessage("Missing checkout session. Returning to pricing…");
      window.setTimeout(() => {
        window.location.assign("/#pricing");
      }, 1200);
      return;
    }

    void (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/billing/checkout/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          message?: string;
          enrolled?: boolean;
          access?: { profileComplete?: boolean };
          user?: ApiUser;
          token?: string;
        };
        if (!res.ok || !body.user || !body.token) {
          throw new ApiError(res.status || 500, body.message || "Unable to complete checkout.");
        }

        saveAuth(body.user, body.token);
        clearPendingPlan();
        setMessage("Payment confirmed. Opening your clinic…");

        if (!body.access?.profileComplete) {
          await navigate({
            to: "/doctor/profile",
            search: { setup: "1" },
            replace: true,
          });
          return;
        }
        await navigate({
          to: "/doctor",
          search: { checkout: "success" },
          replace: true,
        });
      } catch (err) {
        setMessage(formatApiError(err, "Unable to complete checkout."));
        window.setTimeout(() => {
          window.location.assign("/#pricing");
        }, 2000);
      }
    })();
  }, [navigate, sessionId]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
