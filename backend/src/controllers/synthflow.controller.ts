import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { getSynthflowSignatureHeader, verifySynthflowSignature } from "../services/synthflow.signature.js";
import {
  getWebhookCallId,
  handleAvailabilityAction,
  handleBookAction,
  handleDataWebhook,
  handleInboundWebhook,
} from "../services/synthflow.webhooks.service.js";
import { synthflowWebhookUrls } from "../config/env.js";

function assertSignature(req: Request, payload: unknown) {
  const callId = getWebhookCallId(payload);
  const signature = getSynthflowSignatureHeader(req);
  if (!verifySynthflowSignature(callId || null, signature)) {
    throw new AppError(401, "Invalid Synthflow webhook signature");
  }
}

export async function inbound(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body;
    const isEmpty =
      body == null ||
      (typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0);

    if (isEmpty) {
      // Initialize / health probe — keep the attached agent (empty override).
      return res.status(200).json({
        call_inbound: {
          override_model_id: "",
          custom_variables: {},
          metadata: { source: "ai-receptionist-backend", probe: true },
        },
      });
    }

    assertSignature(req, body);
    const response = await handleInboundWebhook(body);
    return res.status(200).json(response);
  } catch (error) {
    console.error("[synthflow] inbound webhook error:", error);
    // Fail open for Initialize probes so Synthflow can save the URL.
    return res.status(200).json({
      call_inbound: {
        override_model_id: "",
        custom_variables: {},
        metadata: {
          source: "ai-receptionist-backend",
          error: error instanceof Error ? error.message : "inbound failed",
        },
      },
    });
  }
}

/** Synthflow (and some proxies) may probe with GET when saving the Data Webhook URL. */
export async function dataHealth(_req: Request, res: Response) {
  return res.status(200).json({ ok: true, webhook: "synthflow-data" });
}

export async function data(req: Request, res: Response, next: NextFunction) {
  try {
    const body = req.body;
    const isEmpty =
      body == null ||
      (typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0);

    // Validation / Initialize probes — always acknowledge so Synthflow can save the URL.
    if (isEmpty) {
      return res.status(200).json({ ok: true, received: "empty" });
    }

    assertSignature(req, body);
    const result = await handleDataWebhook(body);
    return res.status(200).json(result);
  } catch (error) {
    console.error("[synthflow] data webhook error:", error);
    // Still return 200 so Synthflow does not treat the endpoint as broken during retries.
    // Real call payloads are still logged above for debugging.
    return res.status(200).json({
      ok: false,
      message: error instanceof Error ? error.message : "webhook processing failed",
    });
  }
}

export async function bookAction(req: Request, res: Response, next: NextFunction) {
  try {
    assertSignature(req, req.body);
    const result = await handleBookAction(req.body);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }
    return next(error);
  }
}

export async function availabilityAction(req: Request, res: Response, next: NextFunction) {
  try {
    assertSignature(req, req.body);
    const result = await handleAvailabilityAction(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function urls(_req: Request, res: Response) {
  return res.json({
    success: true,
    webhooks: synthflowWebhookUrls(),
    pasteIntoSynthflow: {
      inboundWebhookUrl: synthflowWebhookUrls().inbound,
      dataWebhookUrl: synthflowWebhookUrls().data,
    },
  });
}
