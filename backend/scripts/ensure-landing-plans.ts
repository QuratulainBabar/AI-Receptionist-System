/**
 * Ensure Starter / Growth / Pilot plans exist in Stripe + DB
 * so landing page CTAs can open checkout for monthly/yearly.
 */
import { PrismaClient, type BillingCycle } from "@prisma/client";
import Stripe from "stripe";
import "dotenv/config";

const prisma = new PrismaClient();

const secret = process.env.STRIPE_SECRET_KEY?.trim();
if (!secret) {
  console.error("STRIPE_SECRET_KEY missing in backend/.env");
  process.exit(1);
}
const stripe = new Stripe(secret);

type Desired = {
  name: string;
  description: string;
  amountCents: number;
  billingCycle: BillingCycle;
  sortOrder: number;
  features: string[];
};

const DESIRED: Desired[] = [
  {
    name: "Starter",
    description: "Best for solo clinics getting started.",
    amountCents: 29900,
    billingCycle: "MONTHLY",
    sortOrder: 10,
    features: [
      "AI phone receptionist",
      "Appointment booking from real availability",
      "SMS OTP confirmation",
      "Doctor dashboard",
      "Stripe plan billing",
    ],
  },
  {
    name: "Starter",
    description: "Best for solo clinics getting started.",
    amountCents: 299000,
    billingCycle: "YEARLY",
    sortOrder: 11,
    features: [
      "AI phone receptionist",
      "Appointment booking from real availability",
      "SMS OTP confirmation",
      "Doctor dashboard",
      "Stripe plan billing",
    ],
  },
  {
    name: "Growth",
    description: "Best for established clinics.",
    amountCents: 59900,
    billingCycle: "MONTHLY",
    sortOrder: 20,
    features: [
      "Everything in Starter",
      "Follow-up scheduling",
      "Clinic team users",
      "My Clinic phone AI configuration",
    ],
  },
  {
    name: "Growth",
    description: "Best for established clinics.",
    amountCents: 599000,
    billingCycle: "YEARLY",
    sortOrder: 21,
    features: [
      "Everything in Starter",
      "Follow-up scheduling",
      "Clinic team users",
      "My Clinic phone AI configuration",
    ],
  },
  {
    name: "Pilot",
    description: "Growth for 1 year at a locked rate.",
    amountCents: 480000,
    billingCycle: "YEARLY",
    sortOrder: 30,
    features: [
      "Same Growth experience",
      "Locked $400/month rate for 1 year",
      "Billed $4,800 yearly",
    ],
  },
];

async function ensurePlan(desired: Desired) {
  // Map legacy "Professional" → Growth
  const aliases =
    desired.name === "Growth"
      ? ["Growth", "Professional"]
      : [desired.name];

  const existing = await prisma.subscriptionPlan.findFirst({
    where: {
      name: { in: aliases },
      billingCycle: desired.billingCycle,
    },
  });

  if (!existing) {
    const product = await stripe.products.create({
      name: `${desired.name} (${desired.billingCycle === "YEARLY" ? "Yearly" : "Monthly"})`,
      description: desired.description,
      metadata: { platform: "ai-receptionist", plan: desired.name },
    });
    const price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: desired.amountCents,
      recurring: { interval: desired.billingCycle === "YEARLY" ? "year" : "month" },
      metadata: { platform: "ai-receptionist", plan: desired.name },
    });
    const created = await prisma.subscriptionPlan.create({
      data: {
        name: desired.name,
        description: desired.description,
        amountCents: desired.amountCents,
        currency: "usd",
        billingCycle: desired.billingCycle,
        features: desired.features,
        stripeProductId: product.id,
        stripePriceId: price.id,
        isActive: true,
        sortOrder: desired.sortOrder,
      },
    });
    console.log(`Created ${desired.name} ${desired.billingCycle} → ${created.id} ($${desired.amountCents / 100})`);
    return;
  }

  let stripePriceId = existing.stripePriceId;
  const needsNewPrice =
    existing.amountCents !== desired.amountCents ||
    existing.billingCycle !== desired.billingCycle;

  if (needsNewPrice) {
    const price = await stripe.prices.create({
      product: existing.stripeProductId,
      currency: "usd",
      unit_amount: desired.amountCents,
      recurring: { interval: desired.billingCycle === "YEARLY" ? "year" : "month" },
      metadata: { platform: "ai-receptionist", plan: desired.name },
    });
    await stripe.prices.update(existing.stripePriceId, { active: false }).catch(() => undefined);
    stripePriceId = price.id;
  }

  await stripe.products
    .update(existing.stripeProductId, {
      name: `${desired.name} (${desired.billingCycle === "YEARLY" ? "Yearly" : "Monthly"})`,
      description: desired.description,
      active: true,
    })
    .catch(() => undefined);

  const updated = await prisma.subscriptionPlan.update({
    where: { id: existing.id },
    data: {
      name: desired.name,
      description: desired.description,
      amountCents: desired.amountCents,
      features: desired.features,
      stripePriceId,
      isActive: true,
      sortOrder: desired.sortOrder,
    },
  });
  console.log(
    `Updated ${updated.name} ${updated.billingCycle} → ${updated.id} ($${updated.amountCents / 100})${needsNewPrice ? " [new Stripe price]" : ""}`,
  );
}

async function main() {
  for (const desired of DESIRED) {
    await ensurePlan(desired);
  }
  console.log("Landing plans ready.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
