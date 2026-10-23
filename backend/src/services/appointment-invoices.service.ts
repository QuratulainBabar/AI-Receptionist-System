import type { AppointmentInvoiceStatus } from "@prisma/client";
import type Stripe from "stripe";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { getStripe, isStripeConfigured } from "../lib/stripe.js";
import { AppError } from "../utils/AppError.js";
import { normalizePhone } from "../utils/phone.js";
import { sendPatientReminderSms } from "./synthflow.client.js";
import { isDoctorSmsEnabled } from "./doctor-sms-preferences.service.js";
import { rememberInvoicePaymentLink } from "./records-link-mirror.service.js";
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

export type InvoicePreview = {
  appointmentId: string;
  reference: string;
  patientName: string;
  patientPhone: string;
  doctorName: string;
  whenLabel: string;
  reason: string;
  clinic: string;
  feeLabel: string;
  amountCents: number;
  amountLabel: string;
  currency: string;
  alreadyPaid: boolean;
  invoiceStatus: PublicAppointmentInvoice["status"] | null;
  existingPaymentUrl: string;
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

/** Prefer the mobile the patient gave while booking (appointment.bookingPhone). */
async function bookingPhoneForInvoice(patientId: string, bookingPhone: string) {
  const stored = normalizePhone(bookingPhone);
  if (stored) return stored;
  const history = await prisma.patientMedicalHistory.findUnique({
    where: { userId: patientId },
    select: { phone: true },
  });
  const fromHistory = normalizePhone(history?.phone || "");
  if (fromHistory) return fromHistory;
  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    select: { phone: true },
  });
  return normalizePhone(patient?.phone || "");
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

async function createCheckoutSession(input: {
  customerId: string;
  amountCents: number;
  currency: string;
  appointmentId: string;
  reference: string;
  doctorName: string;
  patientId: string;
  doctorUserId: string;
  description: string;
}) {
  const stripe = getStripe();
  const clientRoot = env.CLIENT_URL.replace(/\/$/, "");
  const doctorLabel = input.doctorName.replace(/^Dr\.?\s*/i, "").trim() || "your doctor";
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: input.customerId,
    client_reference_id: input.appointmentId,
    success_url: `${clientRoot}/invoice/complete?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientRoot}/invoice/complete?status=cancelled&session_id={CHECKOUT_SESSION_ID}`,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency.toLowerCase() || "usd",
          unit_amount: input.amountCents,
          product_data: {
            name: `Consultation — ${input.reference}`,
            description: input.description,
          },
        },
      },
    ],
    metadata: {
      kind: "appointment_invoice",
      appointmentId: input.appointmentId,
      appointmentReference: input.reference,
      patientId: input.patientId,
      doctorUserId: input.doctorUserId,
      doctorName: doctorLabel,
    },
    payment_intent_data: {
      metadata: {
        kind: "appointment_invoice",
        appointmentId: input.appointmentId,
      },
    },
  });

  if (!session.url) {
    throw new AppError(502, "Stripe did not return a Checkout URL for this invoice.");
  }

  return { sessionId: session.id, url: session.url };
}

function invoiceMessage(input: {
  doctorName: string;
  amountLabel: string;
  url: string;
}) {
  const doctorLabel = input.doctorName.startsWith("Dr")
    ? input.doctorName
    : `Dr. ${input.doctorName.replace(/^Dr\.?\s*/i, "").trim()}`;
  return `Hello, your consultation invoice from ${doctorLabel} is ${input.amountLabel}. You can securely complete your payment using this link: ${input.url}`;
}

/**
 * Deliver the payment link via the clinic voice agent's INCALL_SMS path
 * (short outbound call). POST /chat/outbound is chat-agent-only and fails
 * for the AI Receptionist voice agent with "Omnichannel chat is only supported
 * for chat agents."
 */
async function deliverInvoiceLink(phone: string, body: string) {
  try {
    await sendPatientReminderSms({ toPhone: phone, body, purpose: "invoice" });
    console.log(`[invoices] Payment link SMS delivered → ${phone}`);
    return { smsError: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[invoices] Payment link SMS failed → ${phone}:`, message);
    return {
      smsError:
        message ||
        "The payment link could not be texted. Checkout URL is still valid — use Payment link.",
    };
  }
}

async function markPaidByAppointmentId(appointmentId: string, stripeSessionOrInvoiceId?: string) {
  const data: {
    status: AppointmentInvoiceStatus;
    paidAt: Date;
    smsError: string;
    stripeInvoiceId?: string;
  } = {
    status: "PAID",
    paidAt: new Date(),
    smsError: "",
  };
  if (stripeSessionOrInvoiceId) data.stripeInvoiceId = stripeSessionOrInvoiceId;

  const result = await prisma.appointmentInvoice.updateMany({
    where: { appointmentId, status: { not: "PAID" } },
    data,
  });
  return result.count > 0;
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
      const id = row.stripeInvoiceId;
      if (id.startsWith("cs_")) {
        const session = await stripe.checkout.sessions.retrieve(id);
        if (session.payment_status === "paid" && row.status !== "PAID") {
          await markPaidByAppointmentId(row.appointmentId, id);
        } else if (session.status === "expired" && row.status !== "FAILED") {
          await prisma.appointmentInvoice.update({
            where: { id: row.id },
            data: { status: "FAILED", smsError: "Stripe Checkout session expired." },
          });
        }
        continue;
      }

      const invoice = await stripe.invoices.retrieve(id);
      if (invoice.status === "paid" && row.status !== "PAID") {
        await markPaidByAppointmentId(row.appointmentId, id);
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

export async function previewInvoiceForDoctor(
  doctorUserId: string,
  appointmentId: string,
): Promise<InvoicePreview> {
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

  const phone = await bookingPhoneForInvoice(appointment.patientId, appointment.bookingPhone);
  const amountCents = appointment.invoice?.amountCents || parseFeeCents(appointment.fee);
  const currency = (appointment.invoice?.currency || "usd").toLowerCase();

  return {
    appointmentId: appointment.id,
    reference: appointment.reference,
    patientName: appointment.patient.fullName,
    patientPhone: phone || "",
    doctorName: appointment.doctorUser.fullName,
    whenLabel: formatClinicDateTime(appointment.startsAt),
    reason: appointment.reason || "",
    clinic: appointment.clinic || "",
    feeLabel: appointment.fee || formatInvoiceAmount(amountCents, currency),
    amountCents,
    amountLabel: formatInvoiceAmount(amountCents, currency),
    currency,
    alreadyPaid: appointment.invoice?.status === "PAID",
    invoiceStatus: appointment.invoice ? toPublicStatus(appointment.invoice.status) : null,
    existingPaymentUrl: appointment.invoice?.hostedInvoiceUrl || "",
  };
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

  // Always use the number captured during booking when present.
  const phone = await bookingPhoneForInvoice(appointment.patientId, appointment.bookingPhone);
  if (!phone) {
    throw new AppError(
      400,
      "This appointment has no booking phone number. The patient must provide a mobile number when booking.",
    );
  }

  const amountCents = appointment.invoice?.amountCents || parseFeeCents(appointment.fee);
  const currency = "usd";
  const amountLabel = formatInvoiceAmount(amountCents, currency);
  const when = formatClinicDateTime(appointment.startsAt);
  const description = `${appointment.reference} with ${appointment.doctorUser.fullName} on ${when}`;

  let stripeCustomerId = appointment.invoice?.stripeCustomerId || "";
  let stripeSessionId = appointment.invoice?.stripeInvoiceId || "";
  let paymentUrl = appointment.invoice?.hostedInvoiceUrl || "";

  const stripe = getStripe();

  // Reuse an open Checkout session when still valid; otherwise create a new one.
  if (stripeSessionId.startsWith("cs_") && paymentUrl) {
    try {
      const remote = await stripe.checkout.sessions.retrieve(stripeSessionId);
      if (remote.payment_status === "paid") {
        await markPaidByAppointmentId(appointment.id, stripeSessionId);
        return { message: "This invoice is already paid.", paymentUrl };
      }
      if (remote.status === "open" && remote.url) {
        paymentUrl = remote.url;
      } else {
        stripeSessionId = "";
        paymentUrl = "";
      }
    } catch {
      stripeSessionId = "";
      paymentUrl = "";
    }
  } else if (stripeSessionId.startsWith("in_")) {
    // Legacy hosted invoices — keep link if still unpaid, else create Checkout.
    try {
      const remote = await stripe.invoices.retrieve(stripeSessionId);
      if (remote.status === "paid") {
        await markPaidByAppointmentId(appointment.id, stripeSessionId);
        return {
          message: "This invoice is already paid.",
          paymentUrl: remote.hosted_invoice_url || paymentUrl,
        };
      }
      if (remote.status === "open" && remote.hosted_invoice_url) {
        paymentUrl = remote.hosted_invoice_url;
      } else {
        stripeSessionId = "";
        paymentUrl = "";
      }
    } catch {
      stripeSessionId = "";
      paymentUrl = "";
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

  if (!paymentUrl || !stripeSessionId.startsWith("cs_")) {
    const created = await createCheckoutSession({
      customerId: stripeCustomerId,
      amountCents,
      currency,
      appointmentId: appointment.id,
      reference: appointment.reference,
      doctorName: appointment.doctorUser.fullName,
      patientId: appointment.patientId,
      doctorUserId: appointment.doctorUserId,
      description,
    });
    stripeSessionId = created.sessionId;
    paymentUrl = created.url;
  }

  await prisma.appointmentInvoice.upsert({
    where: { appointmentId: appointment.id },
    update: {
      amountCents,
      currency,
      status: "PENDING",
      stripeCustomerId,
      stripeInvoiceId: stripeSessionId,
      hostedInvoiceUrl: paymentUrl,
      phone,
      smsError: "",
    },
    create: {
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      doctorUserId: appointment.doctorUserId,
      amountCents,
      currency,
      status: "PENDING",
      stripeCustomerId,
      stripeInvoiceId: stripeSessionId,
      hostedInvoiceUrl: paymentUrl,
      phone,
    },
  });

  const smsBody = invoiceMessage({
    doctorName: appointment.doctorUser.fullName,
    amountLabel,
    url: paymentUrl,
  });

  rememberInvoicePaymentLink({
    phone,
    appointmentReference: appointment.reference,
    amountLabel,
    paymentUrl,
    smsBody,
  });

  const invoiceSmsOn = await isDoctorSmsEnabled(doctorUserId, "invoiceLinks");
  if (!invoiceSmsOn) {
    await prisma.appointmentInvoice.update({
      where: { appointmentId: appointment.id },
      data: { status: "PENDING", smsError: "Invoice SMS is turned off in Settings." },
    });
    return {
      message: `Invoice created. Invoice texts are turned off in Settings, so the payment link was not sent. ${paymentUrl}`,
      paymentUrl,
    };
  }

  const delivery = await deliverInvoiceLink(phone, smsBody);

  await prisma.appointmentInvoice.update({
    where: { appointmentId: appointment.id },
    data: delivery.smsError
      ? { status: "FAILED", smsError: delivery.smsError }
      : { status: "SENT", smsError: "", sentAt: new Date() },
  });

  const message = delivery.smsError
    ? `Invoice created, but the text was not delivered to ${phone}. Payment link: ${paymentUrl}`
    : `Invoice for ${amountLabel} sent to ${phone}.`;
  return { message, paymentUrl };
}

export async function handleStripeInvoiceEvent(event: Stripe.Event) {
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.expired" &&
    event.type !== "invoice.paid" &&
    event.type !== "invoice.payment_failed"
  ) {
    return false;
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.kind !== "appointment_invoice") return false;
    const appointmentId = session.metadata.appointmentId || session.client_reference_id || "";
    if (!appointmentId) return false;

    if (event.type === "checkout.session.completed" && session.payment_status === "paid") {
      await markPaidByAppointmentId(appointmentId, session.id);
      console.log(`[invoices] Checkout paid appointment=${appointmentId} session=${session.id}`);
      return true;
    }

    if (event.type === "checkout.session.expired") {
      await prisma.appointmentInvoice.updateMany({
        where: { appointmentId, status: { not: "PAID" } },
        data: { status: "FAILED", smsError: "Checkout session expired before payment." },
      });
      return true;
    }
    return true;
  }

  const invoice = event.data.object as Stripe.Invoice;
  const appointmentId = invoice.metadata?.appointmentId;
  if (invoice.metadata?.kind !== "appointment_invoice" || !appointmentId) return false;

  if (event.type === "invoice.paid") {
    await markPaidByAppointmentId(appointmentId, invoice.id);
    return true;
  }

  await prisma.appointmentInvoice.updateMany({
    where: { appointmentId, status: { not: "PAID" } },
    data: { status: "FAILED", smsError: "The patient's payment failed." },
  });
  return true;
}
