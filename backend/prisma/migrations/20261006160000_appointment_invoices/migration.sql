-- Stripe invoices for appointment payments in the doctor dashboard.

CREATE TYPE "AppointmentInvoiceStatus" AS ENUM ('PENDING', 'SENT', 'PAID', 'FAILED');

CREATE TABLE "appointment_invoices" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "AppointmentInvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "stripeCustomerId" TEXT NOT NULL DEFAULT '',
    "stripeInvoiceId" TEXT NOT NULL DEFAULT '',
    "hostedInvoiceUrl" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "smsError" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appointment_invoices_appointmentId_key" ON "appointment_invoices"("appointmentId");
CREATE INDEX "appointment_invoices_doctorUserId_status_idx" ON "appointment_invoices"("doctorUserId", "status");
CREATE INDEX "appointment_invoices_stripeInvoiceId_idx" ON "appointment_invoices"("stripeInvoiceId");

ALTER TABLE "appointment_invoices" ADD CONSTRAINT "appointment_invoices_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
