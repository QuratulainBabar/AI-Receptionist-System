/**
 * Trace local DB slots → handleAvailabilityAction → live Synthflow action URL/attachment.
 */
import "dotenv/config";
import { env, synthflowWebhookUrls } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import { handleAvailabilityAction } from "../src/services/synthflow.webhooks.service.js";
import {
  findActionIdByName,
  listAssistantActionIds,
  listAssistants,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const now = new Date();
  const open = await prisma.availabilitySlot.findMany({
    where: { isBooked: false, startsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    take: 30,
    include: { doctor: { include: { user: { select: { fullName: true, id: true } } } } },
  });
  console.log(
    "db_open_slots",
    JSON.stringify(
      open.map((s) => ({
        id: s.id,
        startsAt: s.startsAt.toISOString(),
        doctor: s.doctor.user.fullName,
        doctorUserId: s.doctor.userId,
      })),
      null,
      2,
    ),
  );

  const emptyDate = await handleAvailabilityAction({ date: "" });
  const today = await handleAvailabilityAction({ date: "today" });
  console.log("api_empty_date", JSON.stringify(emptyDate, null, 2));
  console.log("api_today", JSON.stringify(today, null, 2));

  const urls = synthflowWebhookUrls();
  console.log("webhook_urls", JSON.stringify(urls, null, 2));
  console.log("PUBLIC_API_URL", env.PUBLIC_API_URL);

  // Probe public tunnel → same handler path Synthflow uses
  try {
    const res = await fetch(urls.availabilityAction, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ date: "today" }),
    });
    const text = await res.text();
    console.log("tunnel_today_status", res.status);
    console.log("tunnel_today_body", text.slice(0, 1200));
  } catch (e) {
    console.log("tunnel_today_error", e instanceof Error ? e.message : e);
  }

  const availId = await findActionIdByName("check_doctor_availability");
  console.log("action_id", availId);
  if (availId) {
    const detail = await synthflowRequest<Json>(
      "GET",
      `/actions/${encodeURIComponent(availId)}`,
    );
    const dResp = ((detail.response as Json | undefined) ?? detail) as Json;
    const actions = (dResp.actions as Json[] | undefined) ?? [dResp];
    const a0 = actions[0] || dResp;
    console.log(
      "action_detail",
      JSON.stringify(
        {
          name: a0.name || a0.action_name,
          url: a0.url || a0.action_url || (a0.CUSTOM_ACTION as Json | undefined)?.url,
          http_mode: a0.http_mode,
          assistants: a0.assistants,
        },
        null,
        2,
      ),
    );
  }

  const listed = await listAssistants({ limit: 50 });
  const aResp = ((listed as Json).response as Json | undefined) ?? (listed as Json);
  const rows = (aResp.assistants as Json[] | undefined) ?? [];
  for (const row of rows) {
    const id = String(row.model_id || row.id || "");
    const name = String(row.name || "");
    if (!/Outbound Test|Receptionist Clinic Receptionist/i.test(name) && id !== env.SYNTHFLOW_AGENT_ID.trim()) {
      continue;
    }
    const actionIds = await listAssistantActionIds(id).catch(() => [] as string[]);
    const names: string[] = [];
    for (const aid of actionIds.slice(0, 20)) {
      // map via catalog later — just count + whether availability id attached
      names.push(aid === availId ? "check_doctor_availability" : aid.slice(0, 8));
    }
    console.log(
      JSON.stringify({
        id,
        name,
        type: row.type,
        actions_count: actionIds.length,
        has_availability: availId ? actionIds.includes(availId) : false,
        action_ids_sample: names,
      }),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
