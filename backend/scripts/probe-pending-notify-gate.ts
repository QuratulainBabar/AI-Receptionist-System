/**
 * Clone a real appointment as PENDING, prove the doctor notify gate, then clean up.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { logAppointmentBookedForDoctor } from "../src/services/notifications.service.js";

async function main() {
  const template = await prisma.appointment.findFirst({
    orderBy: { createdAt: "desc" },
  });
  if (!template) throw new Error("No appointment template");

  const startsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const appointment = await prisma.appointment.create({
    data: {
      reference: `PROBE-${Date.now()}`,
      patientId: template.patientId,
      doctorUserId: template.doctorUserId,
      startsAt,
      durationMinutes: template.durationMinutes,
      mode: template.mode,
      reason: "probe pending notify gate",
      fee: template.fee,
      clinic: template.clinic,
      specialtyName: template.specialtyName,
      status: "PENDING",
      bookingPhone: template.bookingPhone,
    },
    include: { patient: true },
  });

  const before = await prisma.doctorNotification.count({
    where: { relatedId: appointment.id, eventType: "booking" },
  });
  const pendingResult = await logAppointmentBookedForDoctor(appointment);
  const afterPending = await prisma.doctorNotification.count({
    where: { relatedId: appointment.id, eventType: "booking" },
  });

  const confirmed = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CONFIRMED" },
    include: { patient: true },
  });
  const confirmedRow = await logAppointmentBookedForDoctor(confirmed);
  const afterConfirm = await prisma.doctorNotification.count({
    where: { relatedId: appointment.id, eventType: "booking" },
  });

  await prisma.doctorNotification.deleteMany({ where: { relatedId: appointment.id } });
  await prisma.appointment.delete({ where: { id: appointment.id } });

  console.log(
    JSON.stringify(
      {
        pending_gate: pendingResult === null && before === 0 && afterPending === 0,
        confirmed_creates: Boolean(confirmedRow) && afterConfirm === 1,
        confirmed_title: confirmedRow?.title ?? null,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
