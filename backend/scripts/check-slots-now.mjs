import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const now = new Date();
const open = await p.availabilitySlot.findMany({
  where: { isBooked: false, startsAt: { gt: now } },
  orderBy: { startsAt: 'asc' },
  take: 40,
  include: { doctor: { include: { user: true } } },
});
console.log('now', now.toISOString());
console.log('open future slots', open.length);
for (const s of open) {
  console.log(
    s.startsAt.toISOString(),
    s.startsAt.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    'doctor',
    s.doctor?.user?.email || s.doctorId,
  );
}
const total = await p.availabilitySlot.count({ where: { isBooked: false } });
console.log('total unbooked any time', total);
await p.$disconnect();
