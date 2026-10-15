import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const pending = await p.appointment.findMany({
  where: { status: "PENDING" },
  select: { id: true, reference: true, slotId: true, bookingPhone: true },
});
console.log("pending holds", pending.length);
for (const row of pending) {
  await p.appointmentOtp.deleteMany({ where: { appointmentId: row.id } });
  await p.availabilitySlot.update({ where: { id: row.slotId }, data: { isBooked: false } }).catch(() => {});
  await p.appointment.delete({ where: { id: row.id } });
  console.log("released", row.reference, row.bookingPhone);
}

const mismatches = await p.availabilitySlot.findMany({
  where: { isBooked: false, appointment: { isNot: null } },
  include: { appointment: { select: { id: true, reference: true, status: true } } },
  take: 50,
});
console.log("slot/appointment mismatches", mismatches.length);
for (const m of mismatches) {
  if (m.appointment?.status === "PENDING") {
    await p.appointment.delete({ where: { id: m.appointment.id } });
    console.log("deleted orphan PENDING", m.appointment.reference);
  } else if (m.appointment && m.isBooked === false) {
    await p.availabilitySlot.update({ where: { id: m.id }, data: { isBooked: true } });
    console.log("fixed isBooked for", m.appointment.reference, m.appointment.status);
  }
}
await p.$disconnect();
console.log("done");
