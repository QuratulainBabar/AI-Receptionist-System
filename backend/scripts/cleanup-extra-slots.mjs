import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const doctorUserId = "cmu16ksa00001vgis6s1oq1m9";

const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
if (!profile) {
  console.log("profile not found");
  process.exit(1);
}

// Keep only unbooked slots on Wed Oct 14, 2026 (America/Los_Angeles).
// Oct 14 00:00 LA = 2026-10-14T07:00:00.000Z (PDT UTC-7)
// Oct 15 00:00 LA = 2026-10-15T07:00:00.000Z
const dayStart = new Date("2026-10-14T07:00:00.000Z");
const dayEnd = new Date("2026-10-15T06:59:59.999Z");

const toDelete = await prisma.availabilitySlot.findMany({
  where: {
    doctorId: profile.id,
    isBooked: false,
    appointment: null,
    OR: [{ startsAt: { lt: dayStart } }, { startsAt: { gt: dayEnd } }],
  },
  orderBy: { startsAt: "asc" },
});

console.log("deleting", toDelete.length, "open slots outside Oct 14 LA");
for (const s of toDelete.slice(0, 30)) {
  console.log(
    s.id,
    s.startsAt.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  );
}

const result = await prisma.availabilitySlot.deleteMany({
  where: {
    doctorId: profile.id,
    isBooked: false,
    appointment: null,
    OR: [{ startsAt: { lt: dayStart } }, { startsAt: { gt: dayEnd } }],
  },
});

const remaining = await prisma.availabilitySlot.findMany({
  where: { doctorId: profile.id, isBooked: false },
  orderBy: { startsAt: "asc" },
});

console.log("deleted", result.count);
console.log("remaining_open", remaining.length);
for (const s of remaining) {
  console.log(
    s.startsAt.toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  );
}

await prisma.$disconnect();
