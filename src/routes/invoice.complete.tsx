import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/invoice/complete")({
  validateSearch: (search: Record<string, unknown>) => ({
    status:
      search.status === "success" || search.status === "cancelled"
        ? (search.status as "success" | "cancelled")
        : undefined,
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  head: () => ({
    meta: [{ title: "Invoice payment — AI Receptionist" }],
  }),
  component: InvoiceCompletePage,
});

function InvoiceCompletePage() {
  const { status } = Route.useSearch();
  const success = status === "success";
  const cancelled = status === "cancelled";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">
          {success ? "Payment received" : cancelled ? "Payment cancelled" : "Invoice payment"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {success
            ? "Thank you. Your consultation payment was submitted securely through Stripe. Your clinic will mark the invoice paid after Stripe confirms the charge."
            : cancelled
              ? "No charge was made. You can use the payment link from your SMS again if you still need to pay."
              : "Open the secure payment link from your SMS to complete the consultation invoice."}
        </p>
        <p className="mt-4 text-xs text-muted-foreground">
          Payment status is confirmed by Stripe webhooks — not by this page alone.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Done
          </Link>
        </div>
      </div>
    </div>
  );
}
