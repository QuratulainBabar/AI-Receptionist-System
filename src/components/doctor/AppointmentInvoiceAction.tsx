import { useState } from "react";
import { Badge, Button } from "@/components/ui/primitives";
import {
  doctorAppointmentsApi,
  formatApiError,
  type ApiAppointment,
  type ApiAppointmentInvoice,
} from "@/lib/api";

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

type InvoicePreview = Awaited<ReturnType<typeof doctorAppointmentsApi.previewInvoice>>["preview"];

export function AppointmentInvoiceAction({
  appointment,
  onUpdated,
}: {
  appointment: ApiAppointment;
  onUpdated: (appointment: ApiAppointment, message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const invoice = appointment.invoice;
  const paid = invoice?.status === "paid";
  const canSend = appointment.status !== "cancelled" && !paid;

  async function openReview() {
    setLoadingPreview(true);
    setError("");
    try {
      const result = await doctorAppointmentsApi.previewInvoice(appointment.id);
      if (result.preview.alreadyPaid) {
        setError("This appointment is already paid.");
        return;
      }
      setPreview(result.preview);
    } catch (err) {
      setError(formatApiError(err, "Unable to load invoice details."));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function confirmSend() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const result = await doctorAppointmentsApi.sendInvoice(appointment.id);
      setPreview(null);
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
        <Button size="sm" variant="soft" disabled={busy || loadingPreview} onClick={() => void openReview()}>
          {loadingPreview ? "Loading…" : invoice ? "Resend invoice" : "Send invoice"}
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
      {invoice?.smsError ? (
        <p className="w-full text-[11px] text-destructive">{invoice.smsError}</p>
      ) : null}
      {error ? <p className="w-full text-[11px] text-destructive">{error}</p> : null}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold text-foreground">Review invoice</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Confirm details before texting the Stripe payment link to the booking phone.
            </p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Appointment</dt>
                <dd className="font-medium text-foreground">{preview.reference}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Patient</dt>
                <dd className="text-right font-medium text-foreground">{preview.patientName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Booking phone</dt>
                <dd className="font-medium text-foreground">{preview.patientPhone || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Doctor</dt>
                <dd className="text-right font-medium text-foreground">{preview.doctorName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Visit</dt>
                <dd className="text-right font-medium text-foreground">{preview.whenLabel}</dd>
              </div>
              {preview.reason ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd className="text-right font-medium text-foreground">{preview.reason}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 border-t border-border pt-2">
                <dt className="text-muted-foreground">Consultation fee</dt>
                <dd className="font-semibold text-foreground">{preview.amountLabel}</dd>
              </div>
            </dl>
            {!preview.patientPhone ? (
              <p className="mt-3 text-xs text-destructive">
                No booking phone on this appointment. The patient must provide a mobile number when booking.
              </p>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                SMS will go to {preview.patientPhone} with a secure Stripe Checkout link for{" "}
                {preview.amountLabel}.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => setPreview(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={busy || !preview.patientPhone}
                onClick={() => void confirmSend()}
              >
                {busy ? "Sending…" : "Send invoice SMS"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
