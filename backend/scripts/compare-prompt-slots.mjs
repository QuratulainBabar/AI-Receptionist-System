import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const promptSlots = [
  { id: "cmv7p2f7v00c4vgxcor90bupx", label: "Wed, Oct 14, 9:00 AM" },
  { id: "cmv7p2f7v00c5vgxcu2dwvthn", label: "Wed, Oct 14, 9:30 AM" },
  { id: "cmv7p2f7v00c6vgxcwrqgnshq", label: "Wed, Oct 14, 10:00 AM" },
  { id: "cmv7p2f7w00c7vgxcir1bc9ib", label: "Wed, Oct 14, 10:30 AM" },
  { id: "cmv7p2f7w00c8vgxc32bqnekz", label: "Wed, Oct 14, 11:00 AM" },
  { id: "cmv7p2f7w00c9vgxc0iaohfxo", label: "Wed, Oct 14, 11:30 AM" },
  { id: "cmv7p2f7w00cavgxc16zeoqe8", label: "Wed, Oct 14, 12:00 PM" },
  { id: "cmv7p2f7w00cbvgxcd3jm04jk", label: "Wed, Oct 14, 12:30 PM" },
];

const doctorUserOrProfileId = "cmu16ksa00001vgis6s1oq1m9";
const now = new Date();

const profile =
  (await prisma.doctorProfile.findUnique({ where: { id: doctorUserOrProfileId } })) ||
  (await prisma.doctorProfile.findUnique({ where: { userId: doctorUserOrProfileId } }));

if (!profile) {
  console.log("Doctor profile not found for", doctorUserOrProfileId);
  process.exit(1);
}

console.log("profile.id", profile.id, "userId", profile.userId);

const dbSlots = await prisma.availabilitySlot.findMany({
  where: {
    doctorId: profile.id,
    isBooked: false,
    startsAt: { gt: now },
  },
  orderBy: { startsAt: "asc" },
  take: 20,
});

function laLabel(d) {
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

console.log("NOW_UTC", now.toISOString());
console.log("NOW_LA", now.toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour12: true }));
console.log("\n=== PROMPT SLOTS (8) ===");
for (const s of promptSlots) {
  const row = await prisma.availabilitySlot.findUnique({ where: { id: s.id } });
  if (!row) {
    console.log("MISSING_IN_DB", s.id, s.label);
    continue;
  }
  console.log(
    "OK",
    s.id.slice(0, 12),
    "prompt=",
    s.label,
    "| db_la=",
    laLabel(row.startsAt),
    "| booked=",
    row.isBooked,
    "| future=",
    row.startsAt > now,
  );
}

console.log("\n=== LOCAL DB FUTURE OPEN (clinic doctor, next 20) ===");
for (const row of dbSlots) {
  const inPrompt = promptSlots.some((p) => p.id === row.id);
  console.log(
    inPrompt ? "MATCH" : "EXTRA",
    row.id.slice(0, 12),
    laLabel(row.startsAt),
    row.id,
  );
}

const promptIds = new Set(promptSlots.map((p) => p.id));
const dbIds = new Set(dbSlots.map((s) => s.id));
const onlyPrompt = promptSlots.filter((p) => !dbIds.has(p.id));
const onlyDb = dbSlots.filter((s) => !promptIds.has(s.id));
const matched = promptSlots.filter((p) => dbIds.has(p.id));

console.log("\n=== SUMMARY ===");
console.log("matched", matched.length);
console.log("only_in_prompt", onlyPrompt.length, onlyPrompt.map((p) => p.label).join("; ") || "-");
console.log("only_in_db_future_top", onlyDb.length, onlyDb.map((s) => laLabel(s.startsAt)).join("; ") || "-");
console.log("exact_id_match_all_8", matched.length === 8 && onlyPrompt.length === 0);

await prisma.$disconnect();
