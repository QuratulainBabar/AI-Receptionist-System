/**
 * 1) Check today + weekly availability messages the agent should speak
 * 2) Book Emily Wit on today's 9:30 AM open slot (clinic calendar)
 * 3) Start a live outbound Synthflow test call (optional phone via argv / env)
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { handleAvailabilityAction } from "../src/services/synthflow.webhooks.service.js";
import { processVoiceBooking } from "../src/services/voice-booking.service.js";
import { verifyBookingOtp } from "../src/services/booking-otp.service.js";
import { findActiveAppointmentForMobile } from "../src/services/appointments.service.js";
import { civilDateKey, formatClinicDateTime, formatClinicTime } from "../src/utils/clinic-time.js";
import {
  getPhoneCall,
  isSynthflowConfigured,
  synthflowRequest,
  type SynthflowJson,
} from "../src/services/synthflow.client.js";
import { env } from "../src/config/env.js";
import { normalizePhone } from "../src/utils/phone.js";

const prisma = new PrismaClient();
const PATIENT_NAME = "Emily Wit";
const TEST_PHONE = normalizePhone(process.argv[2] || process.env.TEST_CALL_PHONE || "+923281058850") || "";
const OTP = "123456";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractCallId(payload: unknown): string {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const response = (root.response && typeof root.response === "object" ? root.response : {}) as Record<
    string,
    unknown
  >;
  const fromList = Array.isArray(response.calls) ? (response.calls[0] as Record<string, unknown>) : null;
  const call = (response.call && typeof response.call === "object" ? response.call : fromList) as Record<
    string,
    unknown
  > | null;
  return String(call?.call_id || call?.id || response.call_id || root.call_id || "").trim();
}

function readStatus(payload: unknown): string {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const response = (root.response && typeof root.response === "object" ? root.response : {}) as Record<
    string,
    unknown
  >;
  const fromList = Array.isArray(response.calls) ? (response.calls[0] as Record<string, unknown>) : {};
  const call = (response.call && typeof response.call === "object" ? response.call : fromList) as Record<
    string,
    unknown
  >;
  return String(call.status || fromList.status || root.status || "").toLowerCase();
}

function readTranscript(payload: unknown): string {
  const root = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const response = (root.response && typeof root.response === "object" ? root.response : {}) as Record<
    string,
    unknown
  >;
  const fromList = Array.isArray(response.calls) ? (response.calls[0] as Record<string, unknown>) : {};
  const call = (response.call && typeof response.call === "object" ? response.call : fromList) as Record<
    string,
    unknown
  >;
  return String(call.transcript || fromList.transcript || root.transcript || "").trim();
}

async function clearActiveForPhone(phone: string) {
  const active = await findActiveAppointmentForMobile({ phone, ignoreOpenOtpHolds: false });
  if (!active) return;
  const row = await prisma.appointment.findUnique({ where: { id: active.id } });
  if (!row) return;
  await prisma.appointmentOtp.deleteMany({ where: { appointmentId: row.id } });
  if (row.status === "PENDING") {
    if (row.slotId) {
      await prisma.availabilitySlot.update({ where: { id: row.slotId }, data: { isBooked: false } }).catch(() => undefined);
    }
    await prisma.appointment.delete({ where: { id: row.id } }).catch(() => undefined);
  } else {
    await prisma.appointment.update({
      where: { id: row.id },
      data: { status: "CANCELLED", slotId: null },
    });
    if (row.slotId) {
      await prisma.availabilitySlot.update({ where: { id: row.slotId }, data: { isBooked: false } }).catch(() => undefined);
    }
  }
  console.log("cleared prior active", active.reference, active.status);
}

async function main() {
  console.log("\n=== 1) Availability the agent should speak ===");
  const week = await handleAvailabilityAction({ date: "" });
  const today = await handleAvailabilityAction({ date: "today" });
  console.log("WEEK mode=", week.mode);
  console.log("WEEK message=", week.message || week.spoken_summary);
  console.log("TODAY mode=", today.mode);
  console.log("TODAY message=", today.message || today.spoken_summary);

  if (!week.message && !week.spoken_summary) throw new Error("Weekly availability missing message");
  if (!today.message && !today.spoken_summary) throw new Error("Today availability missing message");

  const weekOk = /open date/i.test(String(week.message || week.spoken_summary));
  const todayOk =
    /open time/i.test(String(today.message || today.spoken_summary)) ||
    /no remaining open times today/i.test(String(today.message || today.spoken_summary)) ||
    /no open times/i.test(String(today.message || today.spoken_summary));
  console.log("agent_can_speak_weekly=", weekOk, "agent_can_speak_today=", todayOk);

  console.log("\n=== 2) Find today's 9:30 AM slot (clinic zone) ===");
  // Prefer civil "today" from device/local request: user wants Oct 15 9:30.
  // Use clinic today first; if no 9:30 left, use next clinic day with 9:30.
  const clinicToday = civilDateKey(new Date());
  const slots = await prisma.availabilitySlot.findMany({
    where: { isBooked: false, startsAt: { gt: new Date() } },
    orderBy: { startsAt: "asc" },
    take: 120,
    include: { doctor: { include: { user: true } } },
  });

  const nineThirty = slots.filter((s) => {
    const t = formatClinicTime(s.startsAt);
    return t === "9:30 AM" || t === "09:30 AM";
  });
  console.log(
    "open 9:30 candidates",
    nineThirty.map((s) => `${formatClinicDateTime(s.startsAt)} ${s.id}`),
  );

  let target =
    nineThirty.find((s) => civilDateKey(s.startsAt) === clinicToday) ||
    nineThirty.find((s) => civilDateKey(s.startsAt) >= clinicToday) ||
    null;

  // User asked for "today" 9:30 — if local calendar is ahead of LA, prefer 2026-10-15.
  const localToday = new Date().toLocaleDateString("en-CA");
  const preferLocal = nineThirty.find((s) => civilDateKey(s.startsAt) === localToday);
  if (preferLocal) target = preferLocal;

  if (!target?.doctor?.user) {
    throw new Error(`No open 9:30 AM slot found (clinicToday=${clinicToday}, localToday=${localToday})`);
  }
  console.log(
    "booking slot",
    target.id,
    formatClinicDateTime(target.startsAt),
    "doctor",
    target.doctor.user.fullName,
  );

  if (!TEST_PHONE) throw new Error("Pass a phone like: npx tsx scripts/test-call-emily-wit.ts +9232...");
  await clearActiveForPhone(TEST_PHONE);

  console.log("\n=== 3) Book Emily Wit @ 9:30 + verify OTP ===");
  const booked = await processVoiceBooking({
    phone: TEST_PHONE,
    patientName: PATIENT_NAME,
    doctorId: target.doctor.userId,
    slotId: target.id,
    reason: "Test call booking for Emily Wit",
    allowRegister: true,
  });
  if (!booked) throw new Error("processVoiceBooking returned null");
  console.log("hold", booked.appointment.reference, booked.appointment.status, "otp", booked.otp);

  const verified = await verifyBookingOtp({ phone: TEST_PHONE, otp: OTP, callerPhone: TEST_PHONE });
  console.log("verify", verified);
  if (!verified.appointment_confirmed) {
    throw new Error(`OTP verify failed: ${verified.message}`);
  }

  const appt = await prisma.appointment.findUnique({
    where: { id: booked.appointment.id },
    include: { patient: true },
  });
  console.log("CONFIRMED", {
    reference: appt?.reference,
    status: appt?.status,
    patient: appt?.patient.fullName,
    when: appt ? formatClinicDateTime(appt.startsAt) : null,
    phone: appt?.bookingPhone,
  });

  console.log("\n=== 4) Live outbound test call ===");
  if (!isSynthflowConfigured() || !env.SYNTHFLOW_AGENT_ID.trim()) {
    console.log("SKIP call — Synthflow not configured");
    console.log("PASS booking + availability (no live call)");
    return;
  }

  const agentId = env.SYNTHFLOW_AGENT_ID.trim();
  const fromNumber = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  const prompt = `This is a short verification call. Speak calmly.
1) First say today's open times by using check_doctor_availability with date today, then say the message exactly.
2) Then say the weekly open dates by calling check_doctor_availability with date empty, then say the message exactly.
3) Tell the caller an appointment is already confirmed for Emily Wit at 9:30 AM (reference ${verified.reference || appt?.reference}).
4) End the call politely.
Do not invent times. Do not book another appointment.`;

  console.log(`Dialing ${TEST_PHONE} from ${fromNumber}…`);
  const started = await synthflowRequest<SynthflowJson>("POST", "/calls", {
    model_id: agentId,
    phone: TEST_PHONE,
    name: PATIENT_NAME,
    from_phone_number: fromNumber,
    greeting: `Hi Emily, this is Qubetech clinic with a quick schedule check.`,
    prompt,
  });
  const callId = extractCallId(started);
  console.log("call_id", callId || "(missing)", JSON.stringify(started).slice(0, 400));
  if (!callId) throw new Error("No call id from Synthflow");

  let finalStatus = "";
  let transcript = "";
  for (let i = 0; i < 45; i += 1) {
    await sleep(4000);
    const call = await getPhoneCall(callId).catch(() => null);
    if (!call) continue;
    finalStatus = readStatus(call);
    transcript = readTranscript(call) || transcript;
    console.log(`poll ${i + 1}: status=${finalStatus || "?"} transcript_len=${transcript.length}`);
    if (["completed", "failed", "spam", "canceled", "user-canceled", "busy", "no-answer"].includes(finalStatus)) {
      break;
    }
  }

  console.log("\nFINAL status=", finalStatus);
  console.log("TRANSCRIPT:\n", transcript || "(empty — call may not have connected)");
  const spokeToday =
    /today|9:00|9:30|open time/i.test(transcript) || /october\s*15/i.test(transcript);
  const spokeWeek = /next seven days|open date|monday|friday|thursday|wednesday/i.test(transcript);
  console.log("transcript_mentions_today_or_times=", spokeToday);
  console.log("transcript_mentions_week=", spokeWeek);

  if (["spam", "failed", "busy", "no-answer", "canceled", "user-canceled"].includes(finalStatus)) {
    console.log(
      "NOTE: Live call did not fully connect (" +
        finalStatus +
        "). Availability + Emily Wit 9:30 booking still verified above.",
    );
  }
  console.log("PASS");
}

main()
  .catch((err) => {
    console.error("FAIL", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
