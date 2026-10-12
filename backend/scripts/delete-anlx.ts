import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.subscriptionPayment.deleteMany({
    where: { invoiceNumber: "ANLXCF2S-0001" },
  });
  console.log(`deleted ${result.count}`);

  const left = await prisma.subscriptionPayment.findMany({
    orderBy: { paidAt: "desc" },
    select: { invoiceNumber: true, userId: true, paidAt: true, amountCents: true },
  });
  for (const row of left) {
    console.log(
      `${row.invoiceNumber} | user=${row.userId ? "linked" : "null"} | $${(row.amountCents / 100).toFixed(2)} | ${row.paidAt.toISOString()}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
