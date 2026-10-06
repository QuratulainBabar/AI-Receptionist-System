import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default("http://localhost:8081"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  SYNTHFLOW_API_KEY: z.string().optional().default(""),
  SYNTHFLOW_WORKSPACE_ID: z.string().optional().default(""),
  SYNTHFLOW_WEBHOOK_SECRET: z.string().optional().default(""),
  SYNTHFLOW_API_BASE_URL: z.string().default("https://api.us.synthflow.ai/v2"),
  SYNTHFLOW_AGENT_ID: z.string().optional().default(""),
  SYNTHFLOW_PHONE_NUMBER: z.string().optional().default(""),
  SYNTHFLOW_SYNC_WEBHOOKS: z
    .enum(["true", "false"])
    .optional()
    .default("true")
    .transform((v) => v === "true"),
  OTP_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(120),
  STRIPE_SECRET_KEY: z.string().optional().default("").transform((v) => v.trim()),
  STRIPE_PUBLISHABLE_KEY: z.string().optional().default("").transform((v) => v.trim()),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default("").transform((v) => v.trim()),
  CLINIC_TIMEZONE: z
    .string()
    .default("America/Los_Angeles")
    .transform((value) => value.trim())
    .refine((value) => US_TIME_ZONES.has(value), {
      message:
        "CLINIC_TIMEZONE must be a US IANA zone such as America/Los_Angeles or America/New_York",
    }),
});

const US_TIME_ZONES = new Set([
  "America/New_York",
  "America/Detroit",
  "America/Kentucky/Louisville",
  "America/Indiana/Indianapolis",
  "America/Chicago",
  "America/Denver",
  "America/Boise",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Juneau",
  "America/Adak",
  "Pacific/Honolulu",
  "America/Puerto_Rico",
]);

export const env = envSchema.parse(process.env);

export function synthflowWebhookUrls(baseUrl = env.PUBLIC_API_URL) {
  const root = baseUrl.replace(/\/$/, "");
  return {
    inbound: `${root}/api/webhooks/synthflow/inbound`,
    data: `${root}/api/webhooks/synthflow/data`,
    bookAction: `${root}/api/webhooks/synthflow/actions/book`,
    availabilityAction: `${root}/api/webhooks/synthflow/actions/availability`,
    checkAppointmentAction: `${root}/api/webhooks/synthflow/actions/check-appointment`,
    verifyOtpAction: `${root}/api/webhooks/synthflow/actions/verify-otp`,
  };
}
