import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Delete orphan Detailed earnings rows (Unknown doctor / no plan)
 * that the admin marked for removal.
 */
const REMOVE_INVOICE_NUMBERS = [
  "AN3JOWTO-0001",
  "ANLXCF2S-0001",
  "VUF5NYTX-0001",
  "EVFOJL2A-0004",
  "EVFOJL2A-0003",
  "EVFOJL2A-0002",
  "EVFOJL2A-0001",
];

async function main() {
  const found = await prisma.subscriptionPayment.findMany({
    where: {
      OR: [
        { invoiceNumber: { in: REMOVE_INVOICE_NUMBERS } },
        { userId: null, planId: null },
      ],
    },
    select: {
      id: true,
      invoiceNumber: true,
      amountCents: true,
      paidAt: true,
      userId: true,
      planId: true,
      stripeInvoiceId: true,
    },
    orderBy: { paidAt: "desc" },
  });

  console.log(`Found ${found.length} payment(s) to remove:`);
  for (const row of found) {
    console.log(
      `- ${row.invoiceNumber || row.stripeInvoiceId} | $${(row.amountCents / 100).toFixed(2)} | ${row.paidAt.toISOString()} | userId=${row.userId || "null"}`,
    );
  }

  if (!found.length) {
    console.log("Nothing to delete.");
    return;
  }

  const ids = found.map((row) => row.id);
  const result = await prisma.subscriptionPayment.deleteMany({
    where: { id: { in: ids } },
  });

  console.log(`Deleted ${result.count} payment row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
