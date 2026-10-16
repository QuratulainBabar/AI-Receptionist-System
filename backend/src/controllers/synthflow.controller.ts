import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { getSynthflowSignatureHeader, verifySynthflowSignature } from "../services/synthflow.signature.js";
import {
  getWebhookCallId,
  handleAvailabilityAction,
  handleBookAction,
  handleCheckAppointmentAction,
  handleDataWebhook,
  handleInboundWebhook,
  handleOfferRecordsUploadAction,
  handleRecordsSmsAction,
  handleVerifyOtpAction,
} from "../services/synthflow.webhooks.service.js";
import { env, synthflowWebhookUrls } from "../config/env.js";
import { getLastRecordsUploadLink } from "../services/records-link-mirror.service.js";

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
    // Always 200 so Synthflow speaks `message` instead of treating a rule block as a tool crash.
    return res.status(200).json(result);
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

export async function checkAppointmentAction(req: Request, res: Response, next: NextFunction) {
  try {
    assertSignature(req, req.body);
    const result = await handleCheckAppointmentAction(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

export async function verifyOtpAction(req: Request, res: Response, next: NextFunction) {
  try {
    assertSignature(req, req.body);
    const result = await handleVerifyOtpAction(req.body);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        success: false,
        appointment_confirmed: false,
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

export async function recordsSmsAction(req: Request, res: Response, next: NextFunction) {
  try {
    assertSignature(req, req.body);
    const result = await handleRecordsSmsAction(req.body);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(200).json({
        success: false,
        message: error.message,
      });
    }
    return next(error);
  }
}

export async function offerRecordsUploadAction(req: Request, res: Response, next: NextFunction) {
  try {
    assertSignature(req, req.body);
    const result = await handleOfferRecordsUploadAction(req.body);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AppError) {
      return res.status(200).json({
        success: false,
        records_sms_sent: false,
        message: error.message,
      });
    }
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

/** Local terminal mirror — returns the last SMS upload link minted on this host. */
export async function lastRecordsUpload(req: Request, res: Response) {
  const expected = env.SYNTHFLOW_WEBHOOK_SECRET.trim();
  const provided =
    String(req.header("x-synthflow-secret") || "").trim() ||
    String(req.query.secret || "").trim();

  if (expected && provided !== expected) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  return res.status(200).json({
    success: true,
    link: getLastRecordsUploadLink(),
  });
}
