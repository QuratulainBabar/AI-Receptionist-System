import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { env } from "../config/env.js";

function generateHmacSignature(secretKey: string, payload: string) {
  const digest = createHmac("sha256", secretKey).update(payload, "utf8").digest();
  return Buffer.from(digest).toString("base64");
}

export function getSynthflowSignatureHeader(req: Request) {
  const candidates = [
    req.header("synthflow-signature"),
    req.header("x-synthflow-signature"),
    req.header("http_synthflow_signature"),
    req.header("SYNTHFLOW_SIGNATURE"),
  ];
  return candidates.find((value) => Boolean(value?.trim()))?.trim() ?? "";
}

/**
 * Synthflow signs `call_id` with the workspace webhook secret (HMAC-SHA256 → base64).
 * When secret or call_id/signature is missing in development, verification is skipped with a warning.
 */
export function verifySynthflowSignature(callId: string | null | undefined, receivedSignature: string) {
  const secret = env.SYNTHFLOW_WEBHOOK_SECRET.trim();
  if (!secret) {
    if (env.NODE_ENV === "production") return false;
    console.warn("[synthflow] WEBHOOK_SECRET not set — skipping signature check");
    return true;
  }

  if (!callId?.trim()) {
    // Inbound `call_inbound` events may not include call_id yet.
    return true;
  }

  if (!receivedSignature) {
    if (env.NODE_ENV === "production") return false;
    console.warn("[synthflow] Missing signature header — allowing in development");
    return true;
  }

  const expected = generateHmacSignature(secret, callId.trim());
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(receivedSignature);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
