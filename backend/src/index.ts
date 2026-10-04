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
import { synthflowRouter } from "./routes/synthflow.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { env, synthflowWebhookUrls } from "./config/env.js";
import { syncAgentWebhooksOnBoot } from "./services/synthflow.client.js";
import { resolveBootAgentId } from "./services/clinic-synthflow.service.js";

const app = express();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ai-receptionist-backend" });
});

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
app.use("/api/doctor/notifications", doctorNotificationsRouter);
app.use("/api/doctor/patients", doctorPatientsRouter);
app.use("/api/doctor/activity", doctorActivityRouter);
app.use("/api/doctor/dashboard", doctorDashboardRouter);
app.use("/api/doctor/profile", doctorProfileRouter);
app.use("/api/doctor/availability", doctorAvailabilityRouter);
app.use("/api/webhooks/synthflow", synthflowRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  const urls = synthflowWebhookUrls();
  console.log(`API listening on http://localhost:${env.PORT}`);
  console.log("[synthflow] Paste these into Synthflow → Deployment Settings → Phone:");
  console.log(`  Inbound Webhook URL: ${urls.inbound}`);
  console.log(`  Data Webhook URL:    ${urls.data}`);
  void resolveBootAgentId()
    .then((agentId) => syncAgentWebhooksOnBoot(agentId))
    .catch(() => syncAgentWebhooksOnBoot());
});
