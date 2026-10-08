import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { doctorsRouter } from "./routes/doctors.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { messagesRouter } from "./routes/messages.js";
import { medicalHistoryRouter } from "./routes/medical-history.js";
import { recordsRouter } from "./routes/records.js";
import { activityRouter } from "./routes/activity.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { doctorAppointmentsRouter } from "./routes/doctor-appointments.js";
import { doctorNotificationsRouter } from "./routes/doctor-notifications.js";
import { doctorPatientsRouter } from "./routes/doctor-patients.js";
import { doctorActivityRouter } from "./routes/doctor-activity.js";
import { doctorDashboardRouter } from "./routes/doctor-dashboard.js";
import { doctorProfileRouter } from "./routes/doctor-profile.js";
import { doctorAvailabilityRouter } from "./routes/doctor-availability.js";
import { doctorSynthflowRouter } from "./routes/doctor-synthflow.js";
import { synthflowRouter } from "./routes/synthflow.js";
import {
  doctorRecordRequestsRouter,
  publicRecordUploadsRouter,
} from "./routes/record-requests.js";
import * as recordRequestsController from "./controllers/record-requests.controller.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { env, synthflowWebhookUrls } from "./config/env.js";
import { syncAgentWebhooksOnBoot } from "./services/synthflow.client.js";
import { resolveBootAgentId, syncClinicDirectoryToSynthflow } from "./services/clinic-synthflow.service.js";
import {
  adminSubscriptionsRouter,
  doctorSubscriptionsRouter,
} from "./routes/subscriptions.js";
import * as subscriptionsController from "./controllers/subscriptions.controller.js";
import { alignDoctorTimeZones } from "./services/doctor-profile.service.js";
import { startAppointmentReminderScheduler } from "./services/appointment-reminders.service.js";
import { clinicTimeZone } from "./utils/clinic-time.js";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  subscriptionsController.stripeWebhook,
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ai-receptionist-backend" });
});

app.get("/upload/:token", recordRequestsController.showUploadPage);
app.use("/api/record-uploads", publicRecordUploadsRouter);

app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/doctors", doctorsRouter);
app.use("/api/appointments", appointmentsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/patient/medical-history", medicalHistoryRouter);
app.use("/api/patient/records", recordsRouter);
app.use("/api/patient/activity", activityRouter);
app.use("/api/patient/dashboard", dashboardRouter);
app.use("/api/doctor/appointments", doctorAppointmentsRouter);
app.use(
  "/api/doctor/appointments/:appointmentId/record-request",
  doctorRecordRequestsRouter,
);
app.use("/api/doctor/notifications", doctorNotificationsRouter);
app.use("/api/doctor/patients", doctorPatientsRouter);
app.use("/api/doctor/activity", doctorActivityRouter);
app.use("/api/doctor/dashboard", doctorDashboardRouter);
app.use("/api/doctor/profile", doctorProfileRouter);
app.use("/api/doctor/availability", doctorAvailabilityRouter);
app.use("/api/doctor/synthflow", doctorSynthflowRouter);
app.use("/api/admin/subscriptions", adminSubscriptionsRouter);
app.use("/api/doctor/subscription", doctorSubscriptionsRouter);
app.use("/api/webhooks/synthflow", synthflowRouter);

app.use(errorHandler);

async function warnIfPublicApiUnreachable() {
  const root = env.PUBLIC_API_URL.replace(/\/$/, "");
  if (!root || root.includes("localhost") || root.includes("127.0.0.1")) {
    console.warn(
      "[synthflow] PUBLIC_API_URL is local — Synthflow cannot reach action webhooks during live calls. Use an ngrok/Cloudflare HTTPS tunnel.",
    );
    return;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${root}/api/health`, {
      signal: controller.signal,
      headers: { "ngrok-skip-browser-warning": "true" },
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(
        `[synthflow] PUBLIC_API_URL health check failed (${res.status}). Live agent actions will say "try again" until the tunnel is fixed: ${root}`,
      );
      return;
    }
    console.log(`[synthflow] PUBLIC_API_URL reachable: ${root}`);
  } catch (error) {
    console.warn(
      `[synthflow] PUBLIC_API_URL is not reachable (${error instanceof Error ? error.message : error}). Live agent actions will fail until you start a tunnel and update PUBLIC_API_URL: ${root}`,
    );
  }
}

app.listen(env.PORT, () => {
  const urls = synthflowWebhookUrls();
  console.log(`API listening on http://localhost:${env.PORT}`);
  console.log(`[clinic-time] Doctor hours and reminders use ${clinicTimeZone()}`);
  startAppointmentReminderScheduler();
  void alignDoctorTimeZones().catch((error) => {
    console.error("[clinic-time] Could not align doctor time zones:", error);
  });
  console.log(`[stripe] Webhook URL: ${env.PUBLIC_API_URL.replace(/\/$/, "")}/api/webhooks/stripe`);
  console.log("[synthflow] Paste these into Synthflow → Deployment Settings → Phone:");
  console.log(`  Inbound Webhook URL: ${urls.inbound}`);
  console.log(`  Data Webhook URL:    ${urls.data}`);
  void warnIfPublicApiUnreachable();
  void resolveBootAgentId()
    .then(async (agentId) => {
      await syncAgentWebhooksOnBoot(agentId);
      if (!env.SYNTHFLOW_SYNC_WEBHOOKS) return;
      await syncClinicDirectoryToSynthflow().catch((error) => {
        console.warn(
          "[synthflow] Could not refresh the receptionist prompt:",
          error instanceof Error ? error.message : error,
        );
      });
    })
    .catch(() => syncAgentWebhooksOnBoot());
});
