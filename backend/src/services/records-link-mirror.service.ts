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

let lastLink: RecordsLinkSnapshot | null = null;
let mirrorTimer: ReturnType<typeof setInterval> | null = null;
let lastPrintedId = "";

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

export function printRecordsUploadLink(link: RecordsLinkSnapshot) {
  console.log("");
  console.log("========== RECORDS UPLOAD LINK (SMS TO SIM) ==========");
  console.log(`[records] time=${link.at}`);
  console.log(`[records] phone=${link.phone}`);
  console.log(`[records] appointment=${link.appointmentReference}`);
  console.log(`[records] doctor=${link.doctorName}`);
  console.log(`[records] upload_url=${link.uploadUrl}`);
  console.log(`[records] sms_body=${link.smsBody}`);
  console.log("======================================================");
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
    `[records] Terminal mirror on — watching ${root} for SMS upload links (local webhooks are not used for live calls).`,
  );

  const tick = async () => {
    try {
      const res = await fetch(`${root}/api/webhooks/synthflow/last-records-upload`, {
        headers: {
          ...(secret ? { "x-synthflow-secret": secret } : {}),
          "ngrok-skip-browser-warning": "true",
        },
      });
      if (!res.ok) return;
      const json = (await res.json()) as { link?: RecordsLinkSnapshot | null };
      const link = json.link;
      if (!link?.id || !link.uploadUrl || link.id === lastPrintedId) return;
      lastPrintedId = link.id;
      printRecordsUploadLink(link);
    } catch {
      // Production may be restarting; keep polling quietly.
    }
  };

  void tick();
  mirrorTimer = setInterval(() => void tick(), 2500);
}
