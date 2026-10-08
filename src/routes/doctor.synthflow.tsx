import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  EmptyNote,
  Field,
  Input,
  PageHeader,
  Panel,
  SectionLabel,
  Textarea,
} from "@/components/ui/primitives";
import { doctorSynthflowApi, formatApiError, type ClinicSynthflowSettings } from "@/lib/api";

export const Route = createFileRoute("/doctor/synthflow")({
  head: () => ({
    meta: [{ title: "Synthflow configuration — AI Receptionist" }],
  }),
  component: DoctorSynthflowConfig,
});

function DoctorSynthflowConfig() {
  const [settings, setSettings] = useState<ClinicSynthflowSettings | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [agentId, setAgentId] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [language, setLanguage] = useState("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const applySettings = useCallback((next: ClinicSynthflowSettings) => {
    setSettings(next);
    setClinicName(next.clinicName);
    setPhoneNumber(next.phoneNumber);
    setAgentId(next.synthflowAgentId || "");
    setFirstMessage(next.agentFirstMessage);
    setSystemPrompt(next.agentSystemPrompt);
    setLanguage(next.agentLanguage || "en");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await doctorSynthflowApi.getSynthflow();
      applySettings(result.settings);
    } catch (err) {
      setError(formatApiError(err, "Unable to load Synthflow settings."));
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await doctorSynthflowApi.updateSynthflow({
        clinicName,
        phoneNumber,
        synthflowAgentId: agentId.trim() || null,
        agentLanguage: language,
        agentFirstMessage: firstMessage,
      });
      applySettings(result.settings);
      setNotice("Settings saved.");
    } catch (err) {
      setError(formatApiError(err, "Unable to save settings."));
    } finally {
      setSaving(false);
    }
  }

  async function createOrUpdateAgent() {
    setAgentBusy(true);
    setError("");
    setNotice("");
    try {
      await doctorSynthflowApi.updateSynthflow({
        clinicName,
        phoneNumber,
        synthflowAgentId: agentId.trim() || null,
        agentLanguage: language,
        agentFirstMessage: firstMessage,
      });
      const result = await doctorSynthflowApi.createOrUpdateSynthflowAgent({
        firstMessage,
        phoneNumber,
        language,
        synthflowAgentId: agentId.trim() || undefined,
      });
      applySettings(result.settings);
      const doctorName = result.clinicDoctorName || result.settings.clinicDoctorName;
      setNotice(
        result.warning
          ? `Agent ${result.action}. ${result.warning}`
          : `Agent ${result.action} successfully (${result.synthflowAgentId})${
              doctorName ? ` — clinic doctor: ${doctorName}` : ""
            }.`,
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to create/update Synthflow agent."));
    } finally {
      setAgentBusy(false);
    }
  }

  async function syncDirectory() {
    setSyncBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await doctorSynthflowApi.syncSynthflowDirectory();
      applySettings(result.settings);
      const doctorName =
        result.clinicDoctorName || result.settings.clinicDoctorName || "clinic doctor";
      setNotice(
        result.warning
          ? `Synced ${doctorName}. ${result.warning}`
          : `Synced ${doctorName} (profile + open slots) to the agent prompt.`,
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to sync clinic doctor profile."));
    } finally {
      setSyncBusy(false);
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
    } catch {
      setNotice("Copy failed — select the URL manually.");
    }
  }

  const agentReady = Boolean(settings?.synthflowAgentId);

  return (
    <>
      <PageHeader
        title="Synthflow configuration"
        description="Clinic phone receptionist for a one-to-one doctor setup — Sync pushes your Doctor Dashboard profile and open slots to the agent."
        actions={
          <Button variant="outline" type="button" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-success">{notice}</p> : null}

      {loading && !settings ? (
        <EmptyNote>Loading Synthflow settings…</EmptyNote>
      ) : (
        <div className="space-y-4">
          <Panel className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <SectionLabel>Status</SectionLabel>
                <p className="mt-1 text-sm text-muted-foreground">
                  Dedicated clinic inbound agent. Patients call; AI books appointments with your practice.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={settings?.synthflowConfigured ? "success" : "warning"}>
                  {settings?.synthflowConfigured ? "API key ready" : "API key missing"}
                </Badge>
                <Badge tone={agentReady ? "success" : "muted"}>
                  {agentReady ? "Agent ready" : "No agent"}
                </Badge>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 font-mono text-[11px] text-muted-foreground space-y-1">
              <div>
                Phone: <span className="text-foreground">{settings?.phoneNumber || "not set"}</span>
              </div>
              <div>
                Agent ID:{" "}
                <span className="text-foreground">{settings?.synthflowAgentId || "not created"}</span>
              </div>
              <div>
                Clinic doctor:{" "}
                <span className="text-foreground">
                  {settings?.clinicDoctorName
                    ? settings.clinicDoctorName
                    : settings?.doctorsCount
                      ? "yes (name unavailable)"
                      : "no doctor profile"}
                </span>
              </div>
              {settings?.synthflowSyncedAt ? (
                <div>Last synced: {new Date(settings.synthflowSyncedAt).toLocaleString()}</div>
              ) : null}
            </div>
          </Panel>

          <Panel className="space-y-4">
            <SectionLabel>1. Clinic & phone</SectionLabel>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Clinic name">
                <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
              </Field>
              <Field label="Inbound phone (E.164)" hint="Must already exist in Synthflow Phone Numbers">
                <Input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+12202205898"
                  className="font-mono"
                />
              </Field>
              <Field label="Language">
                <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="en" />
              </Field>
              <Field label="Existing agent ID (optional)" hint="Paste to link an agent already created in Fine-tuner">
                <Input
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="414f…8c18"
                  className="font-mono"
                />
              </Field>
            </div>
          </Panel>

          <Panel className="space-y-4">
            <SectionLabel>2. Greeting & prompt</SectionLabel>
            <Field label="First message (greeting)">
              <Textarea
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                rows={2}
              />
            </Field>
            <Field
              label="Last synced system prompt (read-only)"
              hint="This is what Sync last pushed (your profile + open slots). Click Sync doctor profile to refresh."
            >
              <Textarea
                value={systemPrompt}
                readOnly
                rows={14}
                className="font-mono text-xs bg-muted/40"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={saving} onClick={() => void saveSettings()}>
                {saving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </Panel>

          <Panel className="space-y-4">
            <SectionLabel>3. Create / update Synthflow agent</SectionLabel>
            <p className="text-sm text-muted-foreground">
              Creates or updates the inbound agent, sets inbound + data webhooks, attaches appointment
              extractors, and injects your doctor profile plus real open slots.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={agentBusy || !settings?.synthflowConfigured}
                onClick={() => void createOrUpdateAgent()}
              >
                {agentBusy
                  ? "Working…"
                  : agentReady
                    ? "Update Synthflow agent"
                    : "Create Synthflow agent"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={syncBusy || !agentReady}
                onClick={() => void syncDirectory()}
              >
                {syncBusy ? "Syncing…" : "Sync doctor profile"}
              </Button>
            </div>
          </Panel>

          <Panel className="space-y-3">
            <SectionLabel>Webhooks (auto-set on the agent)</SectionLabel>
            <Field label="Inbound webhook URL">
              <div className="flex gap-2">
                <Input readOnly value={settings?.webhookUrls.inbound || ""} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(settings?.webhookUrls.inbound || "")}
                >
                  Copy
                </Button>
              </div>
            </Field>
            <Field label="Data webhook URL (post-call)">
              <div className="flex gap-2">
                <Input readOnly value={settings?.webhookUrls.data || ""} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(settings?.webhookUrls.data || "")}
                >
                  Copy
                </Button>
              </div>
            </Field>
            <p className="text-xs text-muted-foreground">
              Set <code>PUBLIC_API_URL</code> to a public HTTPS tunnel so Synthflow can reach these URLs.
            </p>
          </Panel>
        </div>
      )}
    </>
  );
}
