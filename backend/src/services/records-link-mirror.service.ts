import { env } from "../config/env.js";

export type RecordsLinkSnapshot = {
  id: string;
  phone: string;
  appointmentReference: string;
  doctorName: string;
  uploadUrl: string;
  smsBody: string;
  at: string;
};

export type InvoiceLinkSnapshot = {
  id: string;
  phone: string;
  appointmentReference: string;
  amountLabel: string;
  paymentUrl: string;
  smsBody: string;
  at: string;
};

let lastLink: RecordsLinkSnapshot | null = null;
let lastInvoiceLink: InvoiceLinkSnapshot | null = null;
let mirrorTimer: ReturnType<typeof setInterval> | null = null;
let lastPrintedId = "";
let lastPrintedInvoiceId = "";

/** Remember the link that was (or will be) texted to the patient's SIM. */
export function rememberRecordsUploadLink(input: {
  phone: string;
  appointmentReference: string;
  doctorName: string;
  uploadUrl: string;
  smsBody: string;
}): RecordsLinkSnapshot {
  lastLink = {
    id: `${Date.now()}-${input.appointmentReference}-${input.phone}`,
    phone: input.phone,
    appointmentReference: input.appointmentReference,
    doctorName: input.doctorName,
    uploadUrl: input.uploadUrl,
    smsBody: input.smsBody,
    at: new Date().toISOString(),
  };
  printRecordsUploadLink(lastLink);
  return lastLink;
}

export function getLastRecordsUploadLink() {
  return lastLink;
}

export function rememberInvoicePaymentLink(input: {
  phone: string;
  appointmentReference: string;
  amountLabel: string;
  paymentUrl: string;
  smsBody: string;
}): InvoiceLinkSnapshot {
  lastInvoiceLink = {
    id: `${Date.now()}-${input.appointmentReference}-${input.phone}`,
    phone: input.phone,
    appointmentReference: input.appointmentReference,
    amountLabel: input.amountLabel,
    paymentUrl: input.paymentUrl,
    smsBody: input.smsBody,
    at: new Date().toISOString(),
  };
  printInvoicePaymentLink(lastInvoiceLink);
  return lastInvoiceLink;
}

export function getLastInvoicePaymentLink() {
  return lastInvoiceLink;
}

export function printInvoicePaymentLink(link: InvoiceLinkSnapshot) {
  console.log("");
  console.log("========== INVOICE PAYMENT LINK (DEBUG PREVIEW) ==========");
  console.log(`[invoice] time=${link.at}`);
  console.log(`[invoice] phone=${link.phone}`);
  console.log(`[invoice] appointment=${link.appointmentReference}`);
  console.log(`[invoice] amount=${link.amountLabel}`);
  console.log(`[invoice] payment_url=${link.paymentUrl}`);
  console.log(`[invoice] sms_body=${link.smsBody}`);
  console.log(`[invoice] note=This block is NOT SMS delivery — only the payload prepared for Synthflow.`);
  console.log("==========================================================");
  console.log("");
}

export function printRecordsUploadLink(link: RecordsLinkSnapshot) {
  console.log("");
  console.log("========== RECORDS UPLOAD LINK (DEBUG PREVIEW) ==========");
  console.log(`[records] time=${link.at}`);
  console.log(`[records] phone=${link.phone}`);
  console.log(`[records] appointment=${link.appointmentReference}`);
  console.log(`[records] doctor=${link.doctorName}`);
  console.log(`[records] upload_url=${link.uploadUrl}`);
  console.log(`[records] sms_body=${link.smsBody}`);
  console.log(`[records] note=This block is NOT SMS delivery — only the payload prepared for Synthflow.`);
  console.log("=========================================================");
  console.log("");
}

function isRemotePublicApi() {
  const root = env.PUBLIC_API_URL.replace(/\/$/, "").toLowerCase();
  return Boolean(root) && !root.includes("localhost") && !root.includes("127.0.0.1");
}

/**
 * When local PUBLIC_API_URL points at production, live call webhooks never hit
 * this process. Poll production for the latest upload link and print it here.
 */
export function startRecordsLinkTerminalMirror() {
  if (!isRemotePublicApi()) return;
  if (mirrorTimer) return;

  const root = env.PUBLIC_API_URL.replace(/\/$/, "");
  const secret = env.SYNTHFLOW_WEBHOOK_SECRET.trim();
  console.log(
    `[records] Terminal mirror on — watching ${root} for records upload + invoice payment SMS links.`,
  );

  const headers = {
    ...(secret ? { "x-synthflow-secret": secret } : {}),
    "ngrok-skip-browser-warning": "true",
  };

  const tick = async () => {
    try {
      const res = await fetch(`${root}/api/webhooks/synthflow/last-records-upload`, { headers });
      if (res.ok) {
        const json = (await res.json()) as { link?: RecordsLinkSnapshot | null };
        const link = json.link;
        if (link?.id && link.uploadUrl && link.id !== lastPrintedId) {
          lastPrintedId = link.id;
          printRecordsUploadLink(link);
        }
      }
    } catch {
      // Production may be restarting; keep polling quietly.
    }

    try {
      const res = await fetch(`${root}/api/webhooks/synthflow/last-invoice-payment`, { headers });
      if (res.ok) {
        const json = (await res.json()) as { link?: InvoiceLinkSnapshot | null };
        const link = json.link;
        if (link?.id && link.paymentUrl && link.id !== lastPrintedInvoiceId) {
          lastPrintedInvoiceId = link.id;
          printInvoicePaymentLink(link);
        }
      }
    } catch {
      // ignore
    }
  };

  void tick();
  mirrorTimer = setInterval(() => void tick(), 2500);
}
