import "dotenv/config";
import { ensureDemoAccounts } from "../src/services/ensure-demo-accounts.service.js";
import { prisma } from "../src/lib/prisma.js";

ensureDemoAccounts()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
