/**
 * Verify availability spoken messages + e2e OTP booking against live DB services.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { handleAvailabilityAction } from "../src/services/synthflow.webhooks.service.js";
import { issueBookingOtp, verifyBookingOtp } from "../src/services/booking-otp.service.js";
import { findActiveAppointmentForMobile } from "../src/services/appointments.service.js";

const prisma = new PrismaClient();
const TEST_PHONE = "+15559887766";

async function cleanup(patientId: string) {
  const rows = await prisma.appointment.findMany({
    where: {
      OR: [{ patientId }, { bookingPhone: TEST_PHONE }],
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { id: true, slotId: true, status: true },
  });
  for (const row of rows) {
    await prisma.appointmentOtp.deleteMany({ where: { appointmentId: row.id } });
    if (row.status === "PENDING") {
      if (row.slotId) {
        await prisma.availabilitySlot
          .update({ where: { id: row.slotId }, data: { isBooked: false } })
          .catch(() => undefined);
      }
      await prisma.appointment.delete({ where: { id: row.id } }).catch(() => undefined);
    } else {
      await prisma.appointment.update({
        where: { id: row.id },
        data: { status: "CANCELLED", slotId: null },
      });
      if (row.slotId) {
        await prisma.availabilitySlot
          .update({ where: { id: row.slotId }, data: { isBooked: false } })
          .catch(() => undefined);
      }
    }
  }
}

function assertHasMessage(label: string, result: { message?: string; spoken_summary?: string }) {
  const msg = result.message || "";
  const spoken = result.spoken_summary || "";
  if (!msg) throw new Error(`${label}: missing message field (agent will not speak)`);
  if (msg !== spoken) throw new Error(`${label}: message !== spoken_summary`);
  if (/do not|cannot check|unable to check/i.test(msg) && !/no open/i.test(msg)) {
    throw new Error(`${label}: refusal-like message: ${msg}`);
  }
  console.log(`OK ${label}:`, msg.slice(0, 180));
}

async function main() {
  const week = await handleAvailabilityAction({ date: "" });
  assertHasMessage("week empty", week);
  if (week.mode !== "dates" && week.mode !== "none") {
    throw new Error(`week mode expected dates, got ${week.mode}`);
  }

  const weekAlias = await handleAvailabilityAction({ date: "weekly schedule" });
  assertHasMessage("week alias", weekAlias);

  const placeholder = await handleAvailabilityAction({ date: "<date>" });
  assertHasMessage("placeholder <date>", placeholder);
  if (placeholder.mode !== "dates" && placeholder.mode !== "none") {
    throw new Error(`placeholder should be week/dates mode, got ${placeholder.mode}`);
  }

  const today = await handleAvailabilityAction({ date: "today" });
  assertHasMessage("today", today);
  if (today.mode !== "slots" && today.mode !== "none") {
    throw new Error(`today mode expected slots, got ${today.mode}`);
  }

  // Pick a real open slot for booking (prefer tomorrow+ so it stays open)
  const slot = await prisma.availabilitySlot.findFirst({
    where: {
      isBooked: false,
      startsAt: { gt: new Date(Date.now() + 2 * 60 * 60 * 1000) },
      appointment: null,
    },
    orderBy: { startsAt: "asc" },
    include: { doctor: { include: { user: true } } },
  });
  if (!slot?.doctor?.user) throw new Error("No free slot for booking test");

  const patient = await prisma.user.findFirst({
    where: { role: "PATIENT", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!patient) throw new Error("No patient");

  await cleanup(patient.id);

  const issued = await issueBookingOtp({
    patientId: patient.id,
    doctorId: slot.doctor.userId,
    slotId: slot.id,
    reason: "availability e2e booking test",
    phone: TEST_PHONE,
  });
  console.log("hold", issued.appointment.reference, issued.appointment.status, "otp", issued.otp);

  const verified = await verifyBookingOtp({ phone: TEST_PHONE, otp: "123456" });
  console.log("verify", verified);
  if (!verified.appointment_confirmed) {
    throw new Error(`Booking verify failed: ${verified.message}`);
  }

  const active = await findActiveAppointmentForMobile({
    patientId: patient.id,
    phone: TEST_PHONE,
    ignoreOpenOtpHolds: true,
  });
  if (!active) throw new Error("CONFIRMED appointment should be active");
  console.log("active", active.reference, active.status);

  await cleanup(patient.id);
  console.log("PASS availability + booking");
}

main()
  .catch((err) => {
    console.error("FAIL", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
