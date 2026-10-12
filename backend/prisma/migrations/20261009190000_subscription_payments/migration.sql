-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PAID', 'REFUNDED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "subscription_payments" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "userId" TEXT,
    "planId" TEXT,
    "stripeInvoiceId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL DEFAULT '',
    "stripeSubscriptionId" TEXT NOT NULL DEFAULT '',
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "amountCents" INT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PAID',
    "billingReason" TEXT NOT NULL DEFAULT '',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_payments_stripeInvoiceId_key" ON "subscription_payments"("stripeInvoiceId");
CREATE INDEX IF NOT EXISTS "subscription_payments_paidAt_idx" ON "subscription_payments"("paidAt");
CREATE INDEX IF NOT EXISTS "subscription_payments_userId_paidAt_idx" ON "subscription_payments"("userId", "paidAt");
CREATE INDEX IF NOT EXISTS "subscription_payments_planId_paidAt_idx" ON "subscription_payments"("planId", "paidAt");
CREATE INDEX IF NOT EXISTS "subscription_payments_status_paidAt_idx" ON "subscription_payments"("status", "paidAt");

DO $$ BEGIN
  ALTER TABLE "subscription_payments"
    ADD CONSTRAINT "subscription_payments_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
