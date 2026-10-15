/**
 * E2E: free slot → issueBookingOtp → re-issue same slot → verify 123456 → CONFIRMED.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { issueBookingOtp, verifyBookingOtp } from "../src/services/booking-otp.service.js";
import { findActiveAppointmentForMobile } from "../src/services/appointments.service.js";

const prisma = new PrismaClient();
const TEST_PHONE = "+15551239999";
const TEST_OTP = "123456";

async function cleanupPatient(patientId: string) {
  const prior = await prisma.appointment.findMany({
    where: {
      OR: [{ patientId }, { bookingPhone: TEST_PHONE }],
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { id: true, slotId: true, status: true },
  });
  for (const row of prior) {
    await prisma.appointmentOtp.deleteMany({ where: { appointmentId: row.id } });
    if (row.status === "PENDING") {
      await prisma.availabilitySlot.update({ where: { id: row.slotId }, data: { isBooked: false } }).catch(() => undefined);
      await prisma.appointment.delete({ where: { id: row.id } }).catch(() => undefined);
    } else {
      await prisma.appointment.update({ where: { id: row.id }, data: { status: "CANCELLED" } });
      await prisma.availabilitySlot.update({ where: { id: row.slotId }, data: { isBooked: false } }).catch(() => undefined);
    }
  }
}

async function main() {
  const now = new Date();
  // Prefer slots with no Appointment row (isBooked can be stale/false while slotId is still unique-held).
  const candidates = await prisma.availabilitySlot.findMany({
    where: { isBooked: false, startsAt: { gt: new Date(now.getTime() + 60 * 60 * 1000) } },
    orderBy: { startsAt: "asc" },
    take: 40,
    include: { doctor: { include: { user: true } }, appointment: true },
  });
  let slot = candidates.find((s) => !s.appointment) ?? null;
  if (!slot) {
    // Clear orphan PENDING on first candidate and reuse it
    const dirty = candidates[0];
    if (!dirty) throw new Error("No free future slot found");
    if (dirty.appointment?.status === "PENDING") {
      await prisma.appointmentOtp.deleteMany({ where: { appointmentId: dirty.appointment.id } });
      await prisma.appointment.delete({ where: { id: dirty.appointment.id } });
    } else if (dirty.appointment) {
      throw new Error(`Slot ${dirty.id} has non-PENDING appointment ${dirty.appointment.reference}`);
    }
    slot = await prisma.availabilitySlot.findUniqueOrThrow({
      where: { id: dirty.id },
      include: { doctor: { include: { user: true } }, appointment: true },
    });
  }
  if (!slot.doctor?.user) throw new Error("No free future slot found");

  const patient = await prisma.user.findFirst({
    where: { role: "PATIENT", isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!patient) throw new Error("No patient user in DB");

  await cleanupPatient(patient.id);

  const doctorUserId = slot.doctor.userId;
  console.log("slot", slot.id, slot.startsAt.toISOString(), "doctor", slot.doctor.user.fullName);

  // Seed a stuck PENDING hold with used OTP (previous failure mode)
  const stuck = await prisma.appointment.create({
    data: {
      reference: `STK${Date.now().toString().slice(-6)}`,
      patientId: patient.id,
      doctorUserId,
      slotId: slot.id,
      startsAt: slot.startsAt,
      durationMinutes: 30,
      mode: "IN_CLINIC",
      reason: "stuck",
      fee: slot.doctor.fee || "$0",
      clinic: slot.doctor.clinic || "Clinic",
      specialtyName: "General",
      status: "PENDING",
      bookingPhone: TEST_PHONE,
    },
  });
  await prisma.availabilitySlot.update({ where: { id: slot.id }, data: { isBooked: true } });
  await prisma.appointmentOtp.create({
    data: {
      phone: TEST_PHONE,
      codeHash: "deadbeef",
      expiresAt: new Date(Date.now() + 120_000),
      usedAt: new Date(),
      appointmentId: stuck.id,
    },
  });
  console.log("seeded stuck PENDING", stuck.id);

  // Stuck PENDING must NOT count as active when ignoring OTP holds
  const blockedWrongly = await findActiveAppointmentForMobile({
    phone: TEST_PHONE,
    patientId: patient.id,
    ignoreOpenOtpHolds: true,
  });
  if (blockedWrongly) {
    throw new Error(`Stuck PENDING incorrectly blocks booking: ${blockedWrongly.reference}`);
  }
  console.log("stuck PENDING ignored by active check — ok");

  const first = await issueBookingOtp({
    patientId: patient.id,
    doctorId: doctorUserId,
    slotId: slot.id,
    reason: "e2e booking test",
    phone: TEST_PHONE,
  });
  console.log("issue #1", first.appointment.reference, first.appointment.status, "otp", first.otp);
  if (first.otp !== TEST_OTP) throw new Error(`Expected OTP ${TEST_OTP}`);

  const second = await issueBookingOtp({
    patientId: patient.id,
    doctorId: doctorUserId,
    slotId: slot.id,
    reason: "e2e booking test retry",
    phone: TEST_PHONE,
  });
  console.log("issue #2 reuse", second.appointment.id, second.appointment.reference);
  if (second.appointment.id !== first.appointment.id) {
    console.warn("note: new hold id (ok if stuck was replaced)", first.appointment.id, "→", second.appointment.id);
  }

  const verified = await verifyBookingOtp({ phone: TEST_PHONE, otp: TEST_OTP });
  console.log("verify", JSON.stringify(verified));
  if (!verified.appointment_confirmed) throw new Error(`Verify failed: ${verified.message}`);

  const row = await prisma.appointment.findUnique({ where: { id: second.appointment.id } });
  if (row?.status !== "CONFIRMED") throw new Error(`Expected CONFIRMED, got ${row?.status}`);
  console.log("CONFIRMED", row.reference);

  const active = await findActiveAppointmentForMobile({
    phone: TEST_PHONE,
    patientId: patient.id,
    ignoreOpenOtpHolds: true,
  });
  if (!active || active.reference !== row.reference) {
    throw new Error(`CONFIRMED should block new booking, got ${active?.reference ?? "null"}`);
  }
  console.log("CONFIRMED blocks new book — ok");

  await cleanupPatient(patient.id);
  console.log("PASS");
}

main()
  .catch((err) => {
    console.error("FAIL", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
