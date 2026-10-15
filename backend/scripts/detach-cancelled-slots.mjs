import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const result = await p.appointment.updateMany({
  where: { status: "CANCELLED", slotId: { not: null } },
  data: { slotId: null },
});
console.log("detached cancelled from slots", result.count);

const free = await p.availabilitySlot.updateMany({
  where: {
    isBooked: true,
    appointment: null,
  },
  data: { isBooked: false },
});
console.log("freed orphan isBooked slots", free.count);
await p.$disconnect();
