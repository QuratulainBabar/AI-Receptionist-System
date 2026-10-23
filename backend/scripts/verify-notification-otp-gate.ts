/**
 * Verify PENDING holds do not create doctor notifications; CONFIRMED does.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { logAppointmentBookedForDoctor } from "../src/services/notifications.service.js";

async function main() {
  // Remove legacy "pending verification" alerts created before the gate.
  const deleted = await prisma.doctorNotification.deleteMany({
    where: {
      OR: [
        { title: { startsWith: "Booking pending verification" } },
        { detail: { contains: "Waiting for patient OTP" } },
      ],
    },
  });
  console.log("deleted_pending_style_notifications", deleted.count);

  const pending = await prisma.appointment.findFirst({
    where: { status: "PENDING" },
    include: { patient: true },
    orderBy: { createdAt: "desc" },
  });
  if (pending) {
    const before = await prisma.doctorNotification.count({
      where: { relatedId: pending.id, eventType: "booking" },
    });
    const result = await logAppointmentBookedForDoctor(pending);
    const after = await prisma.doctorNotification.count({
      where: { relatedId: pending.id, eventType: "booking" },
    });
    console.log(
      JSON.stringify({
        pending_id: pending.id,
        log_result: result,
        notifications_before: before,
        notifications_after: after,
        gated: result === null && before === after,
      }),
    );
  } else {
    console.log("no_pending_appointment_to_probe");
  }

  const confirmed = await prisma.appointment.findFirst({
    where: { status: "CONFIRMED" },
    include: { patient: true },
    orderBy: { updatedAt: "desc" },
  });
  if (confirmed) {
    const row = await logAppointmentBookedForDoctor(confirmed);
    console.log(
      JSON.stringify({
        confirmed_id: confirmed.id,
        notification_id: row?.id ?? null,
        title: row?.title ?? null,
        ok: Boolean(row?.title?.startsWith("New booking")),
      }),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
