import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export type MailResult = { ok: true; messageId: string } | { ok: false; error: string };

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      // Keep the live voice call from hanging on a slow SMTP server.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
}

/** Send a plain-text email via the configured SMTP account. Never throws. */
export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<MailResult> {
  const transport = getTransporter();
  if (!transport) return { ok: false, error: "SMTP is not configured (SMTP_HOST missing)." };
  try {
    const info = await transport.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    const rejected = (info.rejected || []).map(String);
    if (rejected.length) return { ok: false, error: `Recipient rejected: ${rejected.join(", ")}` };
    return { ok: true, messageId: info.messageId || "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
