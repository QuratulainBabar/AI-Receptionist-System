import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const now = new Date();
const open = await p.availabilitySlot.count({
  where: { isBooked: false, startsAt: { gt: now } },
});
console.log("open future slots", open, "now", now.toISOString());

// Dynamic import via compiled path won't work; call prisma logic mirroring handler
const doctor = await p.doctorProfile.findFirst({
  where: {
    user: { isActive: true, role: "DOCTOR" },
    clinic: { not: "" },
    fee: { not: "" },
    specialtyId: { not: "unspecified" },
  },
  include: {
    user: true,
    availability: {
      where: { isBooked: false, startsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      take: 64,
    },
  },
  orderBy: { updatedAt: "desc" },
});
console.log(
  "clinic doctor",
  doctor?.user?.fullName,
  "slots",
  doctor?.availability?.length,
);
if (doctor?.availability?.length) {
  const byDay = new Map();
  for (const s of doctor.availability) {
    const key = s.startsAt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  console.log("slots by clinic day", Object.fromEntries([...byDay.entries()].slice(0, 10)));
  const todayKey = now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  const todaySlots = doctor.availability.filter(
    (s) => s.startsAt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }) === todayKey,
  );
  console.log("todayKey", todayKey, "today open", todaySlots.length);
  for (const s of todaySlots.slice(0, 8)) {
    console.log(
      " ",
      s.startsAt.toISOString(),
      s.startsAt.toLocaleString("en-US", {
        timeZone: "America/Los_Angeles",
        weekday: "short",
        hour: "numeric",
        minute: "2-digit",
      }),
    );
  }
}

await p.$disconnect();
