import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  PORT: z.coerce.number().default(4000),
  CLIENT_URL: z.string().default("http://localhost:3000"),
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
});

export const env = envSchema.parse(process.env);

export function synthflowWebhookUrls(baseUrl = env.PUBLIC_API_URL) {
  const root = baseUrl.replace(/\/$/, "");
  return {
    inbound: `${root}/api/webhooks/synthflow/inbound`,
    data: `${root}/api/webhooks/synthflow/data`,
    bookAction: `${root}/api/webhooks/synthflow/actions/book`,
    availabilityAction: `${root}/api/webhooks/synthflow/actions/availability`,
  };
}
