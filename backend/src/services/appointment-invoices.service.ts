import type { AppointmentInvoiceStatus } from "@prisma/client";
import type Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { getStripe, isStripeConfigured } from "../lib/stripe.js";
import { AppError } from "../utils/AppError.js";
import { normalizePhone } from "../utils/phone.js";
import { sendPatientReminderSms } from "./synthflow.client.js";
import { formatClinicDateTime } from "../utils/clinic-time.js";

const OPEN_STATUSES: AppointmentInvoiceStatus[] = ["PENDING", "SENT", "FAILED"];

export type PublicAppointmentInvoice = {
  status: "pending" | "sent" | "paid" | "failed";
  amountCents: number;
  amountLabel: string;
  currency: string;
  hostedInvoiceUrl: string;
  phone: string;
  smsError: string;
  sentAt: string | null;
  paidAt: string | null;
};

function toPublicStatus(status: AppointmentInvoiceStatus): PublicAppointmentInvoice["status"] {
  switch (status) {
    case "SENT":
      return "sent";
    case "PAID":
      return "paid";
    case "FAILED":
      return "failed";
    default:
      return "pending";
  }
}

export function formatInvoiceAmount(amountCents: number, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

export function toPublicAppointmentInvoice(row: {
  status: AppointmentInvoiceStatus;
  amountCents: number;
  currency: string;
  hostedInvoiceUrl: string;
  phone: string;
  smsError: string;
  sentAt: Date | null;
  paidAt: Date | null;
} | null): PublicAppointmentInvoice | null {
  if (!row) return null;
  return {
    status: toPublicStatus(row.status),
    amountCents: row.amountCents,
    amountLabel: formatInvoiceAmount(row.amountCents, row.currency),
    currency: row.currency,
    hostedInvoiceUrl: row.hostedInvoiceUrl,
    phone: row.phone,
    smsError: row.smsError,
    sentAt: row.sentAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
  };
}

function parseFeeCents(fee: string) {
  const match = fee.replace(/,/g, "").match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) {
    throw new AppError(400, "This appointment has no fee. Set a consultation fee before sending an invoice.");
  }
  const cents = Math.round(Number(match[1]) * 100);
  if (!Number.isFinite(cents) || cents < 50) {
    throw new AppError(400, "The appointment fee must be at least $0.50 to create a Stripe invoice.");
  }
  return cents;
}

function usableEmail(email: string) {
  const value = email.trim().toLowerCase();
  if (!value.includes("@")) return "";
  if (value.endsWith("@patients.local") || value.endsWith(".local")) return "";
  return value;
}

function billingEmail(patientId: string, email: string) {
  return usableEmail(email) || `billing.${patientId}@example.com`;
}

async function patientPhone(patientId: string, bookingPhone: string) {
  const stored = normalizePhone(bookingPhone);
  if (stored) return stored;
  const history = await prisma.patientMedicalHistory.findUnique({
    where: { userId: patientId },
    select: { phone: true },
  });
  return normalizePhone(history?.phone || "");
}

async function customerIdForPatient(input: {
  patientId: string;
  fullName: string;
  email: string;
  phone: string;
}) {
  const stripe = getStripe();
  const prior = await prisma.appointmentInvoice.findFirst({
    where: { patientId: input.patientId, stripeCustomerId: { not: "" } },
    orderBy: { createdAt: "desc" },
    select: { stripeCustomerId: true },
  });
  if (prior?.stripeCustomerId) return prior.stripeCustomerId;

  const email = billingEmail(input.patientId, input.email);
  const customer = await stripe.customers.create({
    name: input.fullName,
    phone: input.phone,
    email,
    metadata: { userId: input.patientId, kind: "patient" },
  });
  return customer.id;
}

async function createHostedInvoice(input: {
  customerId: string;
  amountCents: number;
  appointmentId: string;
  reference: string;
  description: string;
}) {
  const stripe = getStripe();
  const draft = await stripe.invoices.create({
    customer: input.customerId,
    collection_method: "send_invoice",
    days_until_due: 7,
    currency: "usd",
    auto_advance: false,
    pending_invoice_items_behavior: "exclude",
    description: input.description,
    metadata: { appointmentId: input.appointmentId, kind: "appointment_invoice" },
  });
  await stripe.invoiceItems.create({
    customer: input.customerId,
    invoice: draft.id,
    amount: input.amountCents,
    currency: "usd",
    description: input.description,
  });
  const finalized = await stripe.invoices.finalizeInvoice(draft.id);
  if (!finalized.hosted_invoice_url) {
    throw new AppError(502, "Stripe did not return a payment link for this invoice.");
  }
  return { invoiceId: finalized.id, url: finalized.hosted_invoice_url };
}

function invoiceMessage(input: {
  reference: string;
  doctorName: string;
  clinic: string;
  when: string;
  amountLabel: string;
  url: string;
}) {
  return `Qubetech: invoice for appointment ${input.reference} with ${input.doctorName} at ${input.clinic || "the clinic"} on ${input.when}. Amount ${input.amountLabel}. Pay securely here: ${input.url}`;
}

async function deliverInvoiceLink(phone: string, body: string) {
  try {
    await sendPatientReminderSms({ toPhone: phone, body, purpose: "invoice" });
    return { smsError: "" };
  } catch (error) {
    console.error(
      "[invoices] Payment link text failed:",
      error instanceof Error ? error.message : error,
    );
    return { smsError: "The payment link could not be texted to the patient's mobile." };
  }
}

export async function syncDoctorAppointmentInvoices(doctorUserId: string) {
  if (!isStripeConfigured()) return;
  const rows = await prisma.appointmentInvoice.findMany({
    where: {
      doctorUserId,
      stripeInvoiceId: { not: "" },
      status: { in: OPEN_STATUSES },
    },
    take: 25,
    orderBy: { updatedAt: "desc" },
  });
  if (!rows.length) return;

  const stripe = getStripe();
  for (const row of rows) {
    try {
      const invoice = await stripe.invoices.retrieve(row.stripeInvoiceId);
      if (invoice.status === "paid" && row.status !== "PAID") {
        await prisma.appointmentInvoice.update({
          where: { id: row.id },
          data: { status: "PAID", paidAt: new Date(), smsError: "" },
        });
      } else if ((invoice.status === "uncollectible" || invoice.status === "void") && row.status !== "FAILED") {
        await prisma.appointmentInvoice.update({
          where: { id: row.id },
          data: { status: "FAILED", smsError: `Stripe invoice is ${invoice.status}.` },
        });
      }
    } catch (error) {
      console.error(
        `[invoices] Could not refresh ${row.stripeInvoiceId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

export async function sendInvoiceForDoctor(doctorUserId: string, appointmentId: string): Promise<{
  message: string;
  paymentUrl: string;
}> {
  if (!isStripeConfigured()) {
    throw new AppError(503, "Stripe is not configured. Add STRIPE_SECRET_KEY to the backend .env file.");
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      patient: true,
      doctorUser: true,
      invoice: true,
    },
  });
  if (!appointment || appointment.doctorUserId !== doctorUserId) {
    throw new AppError(404, "Appointment not found");
  }
  if (appointment.status === "CANCELLED") {
    throw new AppError(400, "Cancelled appointments cannot be invoiced.");
  }
  if (appointment.invoice?.status === "PAID") {
    throw new AppError(409, "This appointment is already paid.");
  }

  const phone = await patientPhone(appointment.patientId, appointment.bookingPhone);
  if (!phone) {
    throw new AppError(400, "This patient has no registered mobile number to receive the invoice.");
  }

  const amountCents = appointment.invoice?.amountCents || parseFeeCents(appointment.fee);
  const amountLabel = formatInvoiceAmount(amountCents);
  const when = formatClinicDateTime(appointment.startsAt);
  const description = `${appointment.reference} with ${appointment.doctorUser.fullName} on ${when}`;

  let stripeCustomerId = appointment.invoice?.stripeCustomerId || "";
  let stripeInvoiceId = appointment.invoice?.stripeInvoiceId || "";
  let hostedInvoiceUrl = appointment.invoice?.hostedInvoiceUrl || "";

  const stripe = getStripe();
  if (stripeInvoiceId) {
    const remote = await stripe.invoices.retrieve(stripeInvoiceId);
    if (remote.status === "paid") {
      await prisma.appointmentInvoice.update({
        where: { appointmentId: appointment.id },
        data: { status: "PAID", paidAt: new Date(), smsError: "" },
      });
      return { message: "This invoice is already paid.", paymentUrl: hostedInvoiceUrl };
    }
    if (remote.status === "void" || remote.status === "uncollectible") {
      stripeInvoiceId = "";
      hostedInvoiceUrl = "";
    } else if (remote.hosted_invoice_url) {
      hostedInvoiceUrl = remote.hosted_invoice_url;
    }
  }

  if (!stripeCustomerId) {
    stripeCustomerId = await customerIdForPatient({
      patientId: appointment.patientId,
      fullName: appointment.patient.fullName,
      email: appointment.patient.email,
      phone,
    });
  } else {
    await stripe.customers.update(stripeCustomerId, {
      email: billingEmail(appointment.patientId, appointment.patient.email),
      phone,
      name: appointment.patient.fullName,
    });
  }

  if (!hostedInvoiceUrl) {
    const created = await createHostedInvoice({
      customerId: stripeCustomerId,
      amountCents,
      appointmentId: appointment.id,
      reference: appointment.reference,
      description,
    });
    stripeInvoiceId = created.invoiceId;
    hostedInvoiceUrl = created.url;
  }

  await prisma.appointmentInvoice.upsert({
    where: { appointmentId: appointment.id },
    update: {
      amountCents,
      status: "PENDING",
      stripeCustomerId,
      stripeInvoiceId,
      hostedInvoiceUrl,
      phone,
      smsError: "",
    },
    create: {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorUserId: appointment.doctorUserId,
      amountCents,
      status: "PENDING",
      stripeCustomerId,
      stripeInvoiceId,
      hostedInvoiceUrl,
      phone,
    },
  });

  const delivery = await deliverInvoiceLink(
    phone,
    invoiceMessage({
      reference: appointment.reference,
      doctorName: appointment.doctorUser.fullName,
      clinic: appointment.clinic,
      when,
      amountLabel,
      url: hostedInvoiceUrl,
    }),
  );

  await prisma.appointmentInvoice.update({
    where: { appointmentId: appointment.id },
    data: delivery.smsError
      ? { status: "FAILED", smsError: delivery.smsError }
      : { status: "SENT", smsError: "", sentAt: new Date() },
  });

  const message = delivery.smsError
    ? `Invoice created, but the text was not delivered. Payment link: ${hostedInvoiceUrl}`
    : `Invoice for ${amountLabel} sent to the patient's mobile.`;
  return { message, paymentUrl: hostedInvoiceUrl };
}

export async function handleStripeInvoiceEvent(event: Stripe.Event) {
  if (event.type !== "invoice.paid" && event.type !== "invoice.payment_failed") return false;
  const invoice = event.data.object as Stripe.Invoice;
  const appointmentId = invoice.metadata?.appointmentId;
  if (invoice.metadata?.kind !== "appointment_invoice" || !appointmentId) return false;

  if (event.type === "invoice.paid") {
    await prisma.appointmentInvoice.updateMany({
      where: { appointmentId },
      data: { status: "PAID", paidAt: new Date(), smsError: "", stripeInvoiceId: invoice.id },
    });
    return true;
  }

  await prisma.appointmentInvoice.updateMany({
    where: { appointmentId, status: { not: "PAID" } },
    data: { status: "FAILED", smsError: "The patient's payment failed." },
  });
  return true;
}
