import { env, synthflowWebhookUrls } from "../config/env.js";

type SynthflowJson = Record<string, unknown>;

function apiBase() {
  return env.SYNTHFLOW_API_BASE_URL.replace(/\/$/, "");
}

export function isSynthflowConfigured() {
  return Boolean(env.SYNTHFLOW_API_KEY.trim());
}

export async function synthflowRequest<T = SynthflowJson>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!isSynthflowConfigured()) {
    throw new Error("SYNTHFLOW_API_KEY is not configured");
  }

  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.SYNTHFLOW_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!response.ok) {
    let message = text || response.statusText;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const detail = obj.detail;
      if (detail && typeof detail === "object") {
        const d = detail as Record<string, unknown>;
        if (typeof d.description === "string" && d.description.trim()) {
          message = d.description;
        }
      } else if (typeof obj.message === "string") {
        message = obj.message;
      } else if (typeof obj.error === "string") {
        message = obj.error;
      }
    }
    const err = new Error(`Synthflow ${method} ${path} failed (${response.status}): ${message}`);
    (err as Error & { status?: number; payload?: unknown }).status = response.status;
    (err as Error & { status?: number; payload?: unknown }).payload = parsed;
    throw err;
  }

  return parsed as T;
}

export function toSynthflowLanguage(code: string) {
  const c = String(code || "en").toLowerCase();
  const map: Record<string, string> = {
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    hi: "hi-IN",
    ar: "ar-SA",
    ur: "ur-PK",
  };
  if (c.includes("-")) return c;
  return map[c] || "en-US";
}

export async function listAssistants(opts?: { limit?: number; offset?: number }) {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return synthflowRequest("GET", `/assistants?limit=${limit}&offset=${offset}`);
}

export async function createInboundAgent(payload: Record<string, unknown>) {
  return synthflowRequest("POST", "/assistants", {
    type: "inbound",
    voice_engine_version: "2.0",
    is_recording: true,
    ...payload,
  });
}

export async function updateAgent(modelId: string, payload: Record<string, unknown>) {
  return synthflowRequest("PUT", `/assistants/${encodeURIComponent(modelId)}`, payload);
}

export async function updateAssistantWebhooks(modelId: string) {
  const urls = synthflowWebhookUrls();
  return updateAgent(modelId, {
    inbound_call_webhook_url: urls.inbound,
    external_webhook_url: urls.data,
  });
}

export async function createInformationExtractor(input: {
  kind: "OPEN_QUESTION" | "YES_NO" | "SINGLE_CHOICE";
  identifier: string;
  description: string;
  examples?: string[];
  choices?: string[];
}) {
  const inner: Record<string, unknown> = {
    identifier: input.identifier,
    description: input.description,
  };
  if (input.kind === "OPEN_QUESTION" && input.examples?.length) inner.examples = input.examples;
  if (input.kind === "SINGLE_CHOICE" && input.choices?.length) inner.choices = input.choices;

  const json = await synthflowRequest<SynthflowJson>("POST", "/actions", {
    INFORMATION_EXTRACTOR: {
      [input.kind]: inner,
    },
  });

  const response = (json.response as SynthflowJson | undefined) ?? {};
  const actionId =
    (response.action_id as string | undefined) ||
    (json.action_id as string | undefined) ||
    (response.id as string | undefined) ||
    (json.id as string | undefined) ||
    null;

  return { raw: json, action_id: actionId };
}

export async function createCustomAction(input: {
  name: string;
  description: string;
  url: string;
  jsonBody: Record<string, string>;
  variables: { name: string; description: string; example: string }[];
  prompt?: string;
  messageError?: string;
}) {
  const json = await synthflowRequest<SynthflowJson>("POST", "/actions", {
    CUSTOM_ACTION: {
      http_mode: "POST",
      url: input.url,
      run_action_before_call_start: false,
      name: input.name,
      description: input.description,
      variables_during_the_call: input.variables.map((variable) => ({
        name: variable.name,
        type: "string",
        description: variable.description,
        example: variable.example,
      })),
      json_body_stringified: JSON.stringify(input.jsonBody),
      prompt: input.prompt,
      message_error: input.messageError,
      agent_speak_naturally: true,
    },
  });

  const response = (json.response as SynthflowJson | undefined) ?? {};
  const actionId =
    (response.action_id as string | undefined) ||
    (json.action_id as string | undefined) ||
    (response.id as string | undefined) ||
    (json.id as string | undefined) ||
    null;

  return { raw: json, action_id: actionId };
}

export async function findActionIdByName(name: string) {
  const want = name.trim().toLowerCase();
  if (!want) return null;
  try {
    const json = await synthflowRequest<SynthflowJson>("GET", "/actions?limit=100");
    const response = (json.response as SynthflowJson | undefined) ?? {};
    const actions = (response.actions as unknown[]) || (json.actions as unknown[]) || [];
    if (!Array.isArray(actions)) return null;
    for (const raw of actions) {
      const row = raw as Record<string, unknown>;
      const actionName = String(row.name || row.action_name || "").trim().toLowerCase();
      if (actionName !== want) continue;
      const id = String(row.action_id || row.id || "").trim();
      if (id) return id;
    }
  } catch (error) {
    console.warn(
      "[synthflow] list actions failed:",
      error instanceof Error ? error.message : error,
    );
  }
  return null;
}

export async function attachActions(modelId: string, actionIds: string[]) {
  const ids = actionIds.filter(Boolean);
  if (!ids.length) return null;
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    actions: ids,
  });
}

/** Fetch a single phone call from Synthflow (includes recording_url when available). */
export async function getPhoneCall(callId: string) {
  const id = callId.trim();
  if (!id) return null;
  return synthflowRequest<SynthflowJson>("GET", `/calls/${encodeURIComponent(id)}`);
}

export function extractRecordingUrlFromCallPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const asRecord = (value: unknown): SynthflowJson =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as SynthflowJson) : {};

  const asString = (value: unknown) => {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
    return "";
  };

  const pick = (obj: SynthflowJson, keys: string[]) => {
    for (const key of keys) {
      const value = asString(obj[key]);
      if (value && /^https?:\/\//i.test(value)) return value;
    }
    return "";
  };

  const root = asRecord(payload);
  const response = asRecord(root.response);
  const call = asRecord(root.call);
  const calls = Array.isArray(response.calls)
    ? response.calls
    : Array.isArray(root.calls)
      ? root.calls
      : [];

  const firstCall = calls.length ? asRecord(calls[0]) : {};

  return (
    pick(call, ["recording_url", "recordingUrl", "recording"]) ||
    pick(firstCall, ["recording_url", "recordingUrl", "recording"]) ||
    pick(response, ["recording_url", "recordingUrl", "recording"]) ||
    pick(root, ["recording_url", "recordingUrl", "recording"]) ||
    ""
  );
}

export async function fetchCallRecordingUrl(callId: string): Promise<string | null> {
  try {
    const payload = await getPhoneCall(callId);
    const url = extractRecordingUrlFromCallPayload(payload);
    return url || null;
  } catch (error) {
    console.warn(
      "[synthflow] Could not fetch call recording:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function findAssistantByPhone(phoneE164: string) {
  const want = phoneE164.trim();
  if (!want) return null;

  for (let page = 0; page < 5; page += 1) {
    const json = await listAssistants({ limit: 50, offset: page * 50 });
    const assistants =
      (json as { response?: { assistants?: unknown[] }; assistants?: unknown[] }).response
        ?.assistants ||
      (json as { assistants?: unknown[] }).assistants ||
      (Array.isArray(json) ? json : []);

    if (!Array.isArray(assistants) || !assistants.length) break;

    for (const raw of assistants) {
      const a = raw as Record<string, unknown>;
      const id = String(a.model_id || a.id || "");
      const direct = String(a.phone_number || "").trim();
      const attached = Array.isArray(a.attached_phone_numbers)
        ? a.attached_phone_numbers
            .map((p) => {
              if (typeof p === "string") return p.trim();
              if (p && typeof p === "object") {
                const row = p as Record<string, unknown>;
                return String(row.phone_number || row.number || "").trim();
              }
              return "";
            })
            .filter(Boolean)
        : [];
      const candidates = [direct, ...attached].filter(Boolean);
      if (candidates.some((n) => n === want || n.replace(/\s/g, "") === want)) {
        return { model_id: id || null, raw: a };
      }
    }

    if (assistants.length < 50) break;
  }

  return null;
}

/**
 * Push inbound + data webhook URLs to the configured Synthflow agent when possible.
 * Prefer DB clinic settings agent id, then env SYNTHFLOW_AGENT_ID.
 */
export async function syncAgentWebhooksOnBoot(agentId?: string | null) {
  if (!env.SYNTHFLOW_SYNC_WEBHOOKS) return;
  if (!isSynthflowConfigured()) {
    console.warn("[synthflow] API key missing — skip webhook sync");
    return;
  }

  const modelId = (agentId || env.SYNTHFLOW_AGENT_ID).trim();
  if (!modelId) {
    console.warn(
      "[synthflow] No agent id — create one in Admin → Synthflow, or set SYNTHFLOW_AGENT_ID",
    );
    return;
  }

  const urls = synthflowWebhookUrls();
  try {
    await updateAssistantWebhooks(modelId);
    console.log("[synthflow] Agent webhooks synced:");
    console.log(`  inbound: ${urls.inbound}`);
    console.log(`  data:    ${urls.data}`);
  } catch (error) {
    console.warn(
      "[synthflow] Could not sync agent webhooks automatically:",
      error instanceof Error ? error.message : error,
    );
    console.warn("[synthflow] Set these URLs manually in Synthflow Deployment Settings → Phone:");
    console.warn(`  Inbound Webhook URL: ${urls.inbound}`);
    console.warn(`  Data Webhook URL:    ${urls.data}`);
  }
}
