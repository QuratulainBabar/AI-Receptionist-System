import { useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import { doctorAppointmentsApi, formatApiError, type ApiAppointment, type ApiAppointmentInvoice } from "@/lib/api";

const invoiceTone: Record<ApiAppointmentInvoice["status"], "warning" | "success" | "destructive"> = {
  pending: "warning",
  sent: "warning",
  paid: "success",
  failed: "destructive",
};

const invoiceLabel: Record<ApiAppointmentInvoice["status"], string> = {
  pending: "Invoice pending",
  sent: "Invoice sent",
  paid: "Invoice paid",
  failed: "Invoice failed",
};

export function AppointmentInvoiceAction({
  appointment,
  onUpdated,
}: {
  appointment: ApiAppointment;
  onUpdated: (appointment: ApiAppointment, message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invoice = appointment.invoice;
  const paid = invoice?.status === "paid";
  const canSend = appointment.status !== "cancelled" && !paid;

  async function send() {
    setBusy(true);
    setError("");
    try {
      const result = await doctorAppointmentsApi.sendInvoice(appointment.id);
      onUpdated(result.appointment, result.message || "Invoice sent.");
    } catch (err) {
      setError(formatApiError(err, "Unable to send the invoice."));
    } finally {
      setBusy(false);
    }
  }

  if (!invoice && !canSend) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {invoice ? (
        <Badge tone={invoiceTone[invoice.status]}>
          {invoiceLabel[invoice.status]}
          {invoice.amountLabel ? ` · ${invoice.amountLabel}` : ""}
        </Badge>
      ) : null}
      {canSend ? (
        <Button size="sm" variant="soft" disabled={busy} onClick={() => void send()}>
          {busy ? "Sending…" : invoice ? "Resend invoice" : "Send invoice"}
        </Button>
      ) : null}
      {invoice?.hostedInvoiceUrl && !paid ? (
        <a
          href={invoice.hostedInvoiceUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
        >
          Payment link
        </a>
      ) : null}
      {error ? <p className="w-full text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
