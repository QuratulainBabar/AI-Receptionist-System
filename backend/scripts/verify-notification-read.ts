/**
 * Verifies unread badges persist across list/ensure and mark-one-read works.
 * Run: npx tsx scripts/verify-notification-read.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  listNotificationsForDoctor,
  markAllNotificationsReadForDoctor,
  markNotificationReadForDoctor,
} from "../src/services/notifications.service.js";

const prisma = new PrismaClient();

async function main() {
  const doctor = await prisma.user.findFirst({
    where: { role: "DOCTOR", isActive: true },
    select: { id: true, email: true, fullName: true },
  });
  if (!doctor) throw new Error("No active doctor found");

  console.log(`Doctor: ${doctor.fullName} <${doctor.email}>`);

  // Ensure there is at least one unread booking notification to exercise.
  let first = await listNotificationsForDoctor(doctor.id);
  console.log(`List #1: ${first.length} total, ${first.filter((n) => n.unread).length} unread`);

  if (!first.length) {
    console.log("No notifications — creating a synthetic booking row for the test…");
    const appt = await prisma.appointment.findFirst({
      where: { doctorUserId: doctor.id, status: { in: ["PENDING", "CONFIRMED"] } },
      select: { id: true },
    });
    if (!appt) throw new Error("No appointment to attach a notification to");
    await prisma.doctorNotification.upsert({
      where: {
        doctorUserId_eventType_relatedId: {
          doctorUserId: doctor.id,
          eventType: "booking",
          relatedId: appt.id,
        },
      },
      create: {
        doctorUserId: doctor.id,
        kind: "new",
        eventType: "booking",
        relatedId: appt.id,
        title: "New booking — Verify Patient",
        detail: "Verification slot",
        occurredAt: new Date(),
        readAt: null,
      },
      update: {
        readAt: null,
        title: "New booking — Verify Patient",
        detail: "Verification slot",
      },
    });
    first = await listNotificationsForDoctor(doctor.id);
    console.log(`List after seed: ${first.filter((n) => n.unread).length} unread`);
  }

  const target = first.find((n) => n.unread) ?? first[0];
  if (!target) throw new Error("Still no notifications");

  // Force unread so mark-one-read is meaningful
  await prisma.doctorNotification.update({
    where: { id: target.id },
    data: { readAt: null },
  });

  const before = await listNotificationsForDoctor(doctor.id);
  const unreadBefore = before.filter((n) => n.unread).length;
  console.log(`Unread before mark: ${unreadBefore}`);

  // Critical: list again must NOT clear read status after we mark
  await markNotificationReadForDoctor(doctor.id, target.id);
  const mid = await listNotificationsForDoctor(doctor.id);
  const marked = mid.find((n) => n.id === target.id);
  if (!marked || marked.unread) {
    throw new Error("FAIL: notification still unread after markOneRead + list (ensure wipe?)");
  }
  console.log("PASS: markOneRead persists across list/ensure");

  const unreadMid = mid.filter((n) => n.unread).length;
  if (unreadMid !== unreadBefore - 1 && unreadBefore > 0) {
    // If target was the only unread we forced, expect decrease by 1
    console.log(`Note: unread ${unreadBefore} → ${unreadMid}`);
  } else {
    console.log(`Unread after mark: ${unreadMid}`);
  }

  // Second list must still keep it read
  const again = await listNotificationsForDoctor(doctor.id);
  const still = again.find((n) => n.id === target.id);
  if (!still || still.unread) {
    throw new Error("FAIL: second list revived unread");
  }
  console.log("PASS: second list keeps readAt");

  await markAllNotificationsReadForDoctor(doctor.id);
  const all = await listNotificationsForDoctor(doctor.id);
  const anyUnread = all.some((n) => n.unread);
  if (anyUnread) throw new Error("FAIL: markAll left unread");
  console.log("PASS: markAll clears unread; history retained:", all.length);

  if (!all[0]?.eventType) throw new Error("FAIL: eventType missing from public payload");
  console.log("PASS: eventType present:", all[0].eventType);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
