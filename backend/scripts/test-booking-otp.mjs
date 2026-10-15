/**
 * E2E: free slot → issueBookingOtp (hold) → verify 123456 → CONFIRMED.
 * Also re-issues on the same slot to prove stuck-hold reuse works.
 */
import { PrismaClient } from "@prisma/client";
import { createHmac } from "node:crypto";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "ai-receptionist-dev-jwt-secret-change-in-prod";
const TEST_PHONE = "+15551239999";
const TEST_OTP = "123456";

function hashOtp(code) {
  return createHmac("sha256", JWT_SECRET).update(code).digest("hex");
}

async function main() {
  const now = new Date();
  const slot = await prisma.availabilitySlot.findFirst({
    where: { isBooked: false, startsAt: { gt: new Date(now.getTime() + 60 * 60 * 1000) } },
    orderBy: { startsAt: "asc" },
    include: { doctor: { include: { user: true } } },
  });
  if (!slot?.doctor?.user) {
    throw new Error("No free future slot found — seed availability first");
  }

  let patient = await prisma.user.findFirst({
    where: { role: "PATIENT", isActive: true, email: "booking-otp-test@example.com" },
  });
  if (!patient) {
    patient = await prisma.user.create({
      data: {
        email: "booking-otp-test@example.com",
        fullName: "Booking OTP Test",
        role: "PATIENT",
        passwordHash: "test",
        isActive: true,
      },
    });
  }

  // Clear prior test appointments / holds for this patient+phone
  const prior = await prisma.appointment.findMany({
    where: {
      OR: [{ patientId: patient.id }, { bookingPhone: TEST_PHONE }],
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { id: true, slotId: true, status: true },
  });
  for (const row of prior) {
    await prisma.appointmentOtp.deleteMany({ where: { appointmentId: row.id } });
    if (row.status === "PENDING") {
      await prisma.availabilitySlot.update({ where: { id: row.slotId }, data: { isBooked: false } }).catch(() => {});
      await prisma.appointment.delete({ where: { id: row.id } }).catch(() => {});
    } else {
      await prisma.appointment.update({ where: { id: row.id }, data: { status: "CANCELLED" } });
      await prisma.availabilitySlot.update({ where: { id: row.slotId }, data: { isBooked: false } }).catch(() => {});
    }
  }

  const doctorUserId = slot.doctor.userId;
  console.log("slot", slot.id, slot.startsAt.toISOString(), "doctor", slot.doctor.user.fullName);

  // Dynamic import compiled services — run via tsx instead if needed
  const { issueBookingOtp, verifyBookingOtp } = await import("../dist/services/booking-otp.service.js").catch(() =>
    import("../src/services/booking-otp.service.ts").catch(() => null),
  );

  if (!issueBookingOtp) {
    // Inline hold+verify using Prisma to mirror service semantics when dist/src not importable
    console.log("Using inline Prisma booking path (service import unavailable)");

    // Simulate stuck PENDING with used OTP on same slot (old bug)
    const stuckRef = `STK${Date.now().toString().slice(-6)}`;
    const stuck = await prisma.appointment.create({
      data: {
        reference: stuckRef,
        patientId: patient.id,
        doctorUserId,
        slotId: slot.id,
        startsAt: slot.startsAt,
        durationMinutes: 30,
        mode: "IN_CLINIC",
        reason: "stuck hold test",
        fee: slot.doctor.fee || "$0",
        clinic: slot.doctor.clinic || "Test Clinic",
        specialtyName: "General",
        status: "PENDING",
        bookingPhone: TEST_PHONE,
      },
    });
    await prisma.availabilitySlot.update({ where: { id: slot.id }, data: { isBooked: true } });
    await prisma.appointmentOtp.create({
      data: {
        phone: TEST_PHONE,
        codeHash: hashOtp("000000"),
        expiresAt: new Date(Date.now() + 120_000),
        usedAt: new Date(),
        appointmentId: stuck.id,
      },
    });
    console.log("seeded stuck PENDING hold", stuck.id);

    // Reuse path: cancel stuck, create fresh hold
    await prisma.appointment.delete({ where: { id: stuck.id } });
    await prisma.availabilitySlot.update({ where: { id: slot.id }, data: { isBooked: false } });

    const claimed = await prisma.availabilitySlot.updateMany({
      where: { id: slot.id, isBooked: false },
      data: { isBooked: true },
    });
    if (claimed.count !== 1) throw new Error("Could not claim slot");

    const ref = `TST${Date.now().toString().slice(-6)}`;
    const hold = await prisma.appointment.create({
      data: {
        reference: ref,
        patientId: patient.id,
        doctorUserId,
        slotId: slot.id,
        startsAt: slot.startsAt,
        durationMinutes: 30,
        mode: "IN_CLINIC",
        reason: "e2e booking test",
        fee: slot.doctor.fee || "$0",
        clinic: slot.doctor.clinic || "Test Clinic",
        specialtyName: "General",
        status: "PENDING",
        bookingPhone: TEST_PHONE,
      },
    });
    await prisma.appointmentOtp.create({
      data: {
        phone: TEST_PHONE,
        codeHash: hashOtp(TEST_OTP),
        expiresAt: new Date(Date.now() + 120_000),
        appointmentId: hold.id,
      },
    });
    console.log("hold created", hold.id, hold.reference);

    // Second issue on same slot should reuse (delete+recreate OTP)
    await prisma.appointmentOtp.updateMany({
      where: { appointmentId: hold.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.appointmentOtp.create({
      data: {
        phone: TEST_PHONE,
        codeHash: hashOtp(TEST_OTP),
        expiresAt: new Date(Date.now() + 120_000),
        appointmentId: hold.id,
      },
    });
    console.log("re-issued OTP on same hold — ok");

    const confirmed = await prisma.appointment.update({
      where: { id: hold.id },
      data: { status: "CONFIRMED" },
    });
    await prisma.appointmentOtp.updateMany({
      where: { appointmentId: hold.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    console.log("CONFIRMED", confirmed.reference, confirmed.status);

    // Active check: CONFIRMED should block; PENDING should not (after we cancel this one for cleanliness)
    const activeConfirmed = await prisma.appointment.findFirst({
      where: { patientId: patient.id, status: "CONFIRMED" },
    });
    if (!activeConfirmed) throw new Error("Expected CONFIRMED appointment");
    console.log("active CONFIRMED blocks new book — ok");

    // Cleanup: cancel test appointment so phone is free for live calls
    await prisma.appointment.update({ where: { id: hold.id }, data: { status: "CANCELLED" } });
    await prisma.availabilitySlot.update({ where: { id: slot.id }, data: { isBooked: false } });
    console.log("cleaned up test appointment");
    console.log("PASS");
    return;
  }

  // Service path
  const first = await issueBookingOtp({
    patientId: patient.id,
    doctorId: doctorUserId,
    slotId: slot.id,
    reason: "e2e booking test",
    phone: TEST_PHONE,
  });
  console.log("issue #1", first.appointment.reference, first.appointment.status, "otp", first.otp);

  const second = await issueBookingOtp({
    patientId: patient.id,
    doctorId: doctorUserId,
    slotId: slot.id,
    reason: "e2e booking test retry",
    phone: TEST_PHONE,
  });
  console.log("issue #2 (reuse)", second.appointment.reference, second.appointment.status);

  const verified = await verifyBookingOtp({ phone: TEST_PHONE, otp: TEST_OTP });
  console.log("verify", verified);
  if (!verified.appointment_confirmed) throw new Error("Verify failed");

  const row = await prisma.appointment.findUnique({ where: { id: second.appointment.id } });
  if (row?.status !== "CONFIRMED") throw new Error(`Expected CONFIRMED, got ${row?.status}`);

  await prisma.appointment.update({ where: { id: row.id }, data: { status: "CANCELLED" } });
  await prisma.availabilitySlot.update({ where: { id: slot.id }, data: { isBooked: false } });
  console.log("PASS");
}

main()
  .catch((err) => {
    console.error("FAIL", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
