import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.subscriptionPayment.findMany({
    orderBy: { paidAt: "desc" },
    take: 20,
    select: {
      id: true,
      invoiceNumber: true,
      stripeInvoiceId: true,
      amountCents: true,
      paidAt: true,
      userId: true,
      planId: true,
    },
  });

  for (const row of rows) {
    console.log(
      `${row.invoiceNumber || "(no number)"} | ${row.stripeInvoiceId} | user=${row.userId || "null"} | plan=${row.planId || "null"} | $${(row.amountCents / 100).toFixed(2)} | ${row.paidAt.toISOString()}`,
    );
  }

  const anix = await prisma.subscriptionPayment.findMany({
    where: {
      OR: [
        { invoiceNumber: { contains: "ANIX", mode: "insensitive" } },
        { stripeInvoiceId: { contains: "ANIX", mode: "insensitive" } },
      ],
    },
  });
  console.log(`ANIX matches: ${anix.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
