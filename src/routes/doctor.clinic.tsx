import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import {
  doctorProfileApi,
  doctorSynthflowApi,
  formatApiError,
  type ApiDoctorProfile,
  type ClinicSynthflowSettings,
} from "@/lib/api";
import {
  Building2,
  CalendarDays,
  Check,
  Copy,
  Languages,
  Phone,
  PhoneCall,
  RefreshCw,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/clinic")({
  head: () => ({
    meta: [
      { title: "My Clinic — Doctor portal" },
      {
        name: "description",
        content: "Manage clinic details and your AI phone receptionist configuration.",
      },
    ],
  }),
  component: DoctorClinicPage,
});

/** Languages mapped in backend `toSynthflowLanguage` — only these persist to the agent. */
const LANGUAGE_OPTIONS = [
  { value: "en", label: "English (en-US)" },
  { value: "ur", label: "Urdu (ur-PK)" },
  { value: "hi", label: "Hindi (hi-IN)" },
  { value: "ar", label: "Arabic (ar-SA)" },
  { value: "es", label: "Spanish (es-ES)" },
  { value: "fr", label: "French (fr-FR)" },
  { value: "de", label: "German (de-DE)" },
] as const;

function DoctorClinicPage() {
  const [settings, setSettings] = useState<ClinicSynthflowSettings | null>(null);
  const [profile, setProfile] = useState<ApiDoctorProfile | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [agentId, setAgentId] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [language, setLanguage] = useState("en");
  const [voiceId, setVoiceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [testCallId, setTestCallId] = useState("");
  const [testCallStatus, setTestCallStatus] = useState("");
  const [testCallDetail, setTestCallDetail] = useState("");
  const [healthSummary, setHealthSummary] = useState("");
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
    setVoiceId(next.agentVoiceId || "");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [synth, profileResult] = await Promise.all([
        doctorSynthflowApi.getSynthflow(),
        doctorProfileApi.get().catch(() => null),
      ]);
      applySettings(synth.settings);
      if (profileResult?.profile) setProfile(profileResult.profile);
    } catch (err) {
      setError(formatApiError(err, "Unable to load clinic settings."));
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveGeneral() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await doctorSynthflowApi.updateSynthflow({
        clinicName,
        phoneNumber,
        synthflowAgentId: agentId.trim() || null,
        agentLanguage: language,
        agentVoiceId: voiceId,
        agentFirstMessage: firstMessage,
      });
      applySettings(result.settings);
      setNotice("Clinic settings saved. Update the AI agent to push greeting, language, and voice live.");
    } catch (err) {
      setError(formatApiError(err, "Unable to save clinic settings."));
    } finally {
      setSaving(false);
    }
  }

  // Guard against stuck "Updating…/Syncing…" if Synthflow is slow.
  async function withBusyTimeout<T>(
    setBusy: (v: boolean) => void,
    work: () => Promise<T>,
    label: string,
    ms = 45_000,
  ): Promise<T | undefined> {
    setBusy(true);
    setError("");
    setNotice("");
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      setBusy(false);
      setError(
        `${label} is taking too long. The backend may still finish — refresh in a moment, or check that ngrok/PUBLIC_API_URL is up.`,
      );
    }, ms);
    try {
      const result = await work();
      if (timedOut) return undefined;
      return result;
    } catch (err) {
      if (!timedOut) throw err;
      return undefined;
    } finally {
      window.clearTimeout(timer);
      if (!timedOut) setBusy(false);
    }
  }

  async function createOrUpdateAgent() {
    try {
      const result = await withBusyTimeout(setAgentBusy, async () => {
        await doctorSynthflowApi.updateSynthflow({
          clinicName,
          phoneNumber,
          synthflowAgentId: agentId.trim() || null,
          agentLanguage: language,
          agentVoiceId: voiceId,
          agentFirstMessage: firstMessage,
        });
        return doctorSynthflowApi.createOrUpdateSynthflowAgent({
          firstMessage,
          phoneNumber,
          language,
          voiceId: voiceId.trim() || undefined,
          synthflowAgentId: agentId.trim() || undefined,
        });
      }, "Update");
      if (!result) return;
      applySettings(result.settings);
      const doctorName = result.clinicDoctorName || result.settings.clinicDoctorName;
      const slotsNote = result.openSlotsSummary
        ? ` Open slots in prompt: ${result.openSlotsSummary}.`
        : "";
      setNotice(
        result.warning
          ? `AI receptionist ${result.action}. ${result.warning}${slotsNote}`
          : `AI receptionist ${result.action}${
              doctorName ? ` — clinic doctor: ${doctorName}` : ""
            }. Profile and open slots refreshed.${slotsNote}`,
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to update the AI receptionist."));
    }
  }

  async function syncDirectory() {
    try {
      const result = await withBusyTimeout(
        setSyncBusy,
        () => doctorSynthflowApi.syncSynthflowDirectory(),
        "Sync",
      );
      if (!result) return;
      applySettings(result.settings);
      const doctorName =
        result.clinicDoctorName || result.settings.clinicDoctorName || "clinic doctor";
      const slotsNote = result.openSlotsSummary
        ? ` Open slots now in prompt: ${result.openSlotsSummary}.`
        : "";
      setNotice(
        result.warning
          ? `Synced ${doctorName}. ${result.warning}${slotsNote}`
          : `Synced ${doctorName} (profile + open slots) to the receptionist.${slotsNote}`,
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to sync doctor profile and availability."));
    }
  }

  async function verifyCallHealth() {
    setHealthBusy(true);
    setError("");
    setHealthSummary("");
    try {
      const result = await doctorSynthflowApi.getCallHealth();
      const checks = [
        result.checks.synthflowConfigured ? "API key" : "API key missing",
        result.checks.agentLinked ? "agent linked" : "agent missing",
        result.checks.clinicPhoneSet ? "clinic phone" : "clinic phone missing",
        result.checks.tunnelOk ? "tunnel OK" : `tunnel down (${result.tunnel.error || "unreachable"})`,
        result.checks.availabilityOk
          ? "availability OK"
          : `availability failed (${result.availability.error || "error"})`,
        result.checks.hasOpenSlots ? "open slots" : "no open slots",
      ].join(" · ");
      setHealthSummary(
        `${result.ok ? "Healthy" : "Needs attention"} — ${result.message} [${checks}]` +
          (result.availability.preview ? ` Availability: ${result.availability.preview}` : "") +
          (result.recentCalls.lastStatus
            ? ` Recent calls: ${result.recentCalls.completed} completed, last=${result.recentCalls.lastStatus}.`
            : ""),
      );
      if (!result.ok) {
        setError(result.message);
      } else {
        setNotice(result.message);
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to verify call health."));
    } finally {
      setHealthBusy(false);
    }
  }

  async function startTestCall() {
    setTestBusy(true);
    setError("");
    setNotice("");
    setTestCallDetail("");
    setTestCallStatus("starting");
    try {
      const result = await doctorSynthflowApi.startTestCall(testPhone.trim());
      setTestCallId(result.callId);
      setTestCallStatus(result.status);
      setNotice(result.message);
      if (result.warning) setError(result.warning);
      setTestCallDetail(
        `Call ${result.callId} → ${result.toPhone} (from ${result.fromPhone}, agent ${result.modelId || "outbound"})`,
      );
    } catch (err) {
      setTestCallStatus("");
      setError(formatApiError(err, "Unable to start the test call."));
    } finally {
      setTestBusy(false);
    }
  }

  useEffect(() => {
    if (!testCallId) return;
    let cancelled = false;
    let ticks = 0;
    const timer = window.setInterval(() => {
      void (async () => {
        ticks += 1;
        try {
          const status = await doctorSynthflowApi.getTestCall(testCallId);
          if (cancelled) return;
          setTestCallStatus(status.status);
          const bits = [
            `Status: ${status.status}`,
            status.duration != null ? `duration ${status.duration}s` : null,
            status.endReason ? `end: ${status.endReason}` : null,
            status.transcriptPreview ? `heard: “${status.transcriptPreview}”` : null,
          ].filter(Boolean);
          setTestCallDetail(bits.join(" · "));
          if (status.finished || ticks >= 40) {
            window.clearInterval(timer);
            if (status.working && status.status === "completed") {
              setNotice("Test call completed — receptionist path is working.");
            } else if (status.finished && !status.working) {
              const pausedHint =
                status.status === "paused"
                  ? " Synthflow never dialed the phone (outbound agent / caller ID issue)."
                  : "";
              setError(
                `Test call ended with status “${status.status}”.${pausedHint} Try again in a minute.`,
              );
            }
          }
        } catch {
          if (ticks >= 3) window.clearInterval(timer);
        }
      })();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [testCallId]);

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied to clipboard.");
    } catch {
      setNotice("Copy failed — select the text manually.");
    }
  }

  const agentReady = Boolean(settings?.synthflowAgentId);
  const connectionReady = Boolean(settings?.synthflowConfigured && agentReady && settings?.phoneNumber);

  return (
    <>
      <PageHeader
        eyebrow="Phone AI"
        title="My Clinic"
        description="Clinic details and AI phone receptionist — sync keeps your profile and bookable slots up to date for callers."
        actions={
          <Button variant="outline" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      {loading && !settings ? (
        <EmptyNote>Loading clinic settings…</EmptyNote>
      ) : (
        <div className="space-y-5">
          {/* Overview / status */}
          <Panel className="overflow-hidden border border-sky-100 p-0">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-sky-100 bg-gradient-to-r from-sky-50 to-blue-50/50 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-blue-600" />
                  <h3 className="text-[15px] font-semibold text-slate-900">Clinic overview</h3>
                </div>
                <p className="mt-1 text-[12.5px] text-slate-500">
                  Dedicated inbound receptionist for your practice. Callers hear your clinic name and book
                  against live open slots.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={settings?.synthflowConfigured ? "success" : "warning"} dot>
                  {settings?.synthflowConfigured ? "Integration ready" : "API key missing"}
                </Badge>
                <Badge tone={agentReady ? "success" : "muted"} dot>
                  {agentReady ? "Receptionist ready" : "No agent yet"}
                </Badge>
                <Badge tone={connectionReady ? "success" : "warning"} dot>
                  {connectionReady ? "Phone connected" : "Phone incomplete"}
                </Badge>
              </div>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <OverviewStat label="Clinic" value={settings?.clinicName || "—"} />
              <OverviewStat
                label="Phone"
                value={settings?.phoneNumber || "Not set"}
                mono
              />
              <OverviewStat
                label="Clinic doctor"
                value={
                  settings?.clinicDoctorName ||
                  profile?.fullName ||
                  (settings?.doctorsCount ? "Profile linked" : "No doctor profile")
                }
              />
              <OverviewStat
                label="Last synced"
                value={
                  settings?.synthflowSyncedAt
                    ? new Date(settings.synthflowSyncedAt).toLocaleString()
                    : "Never"
                }
              />
            </div>
          </Panel>

          {/* General */}
          <Panel className="space-y-4 border border-sky-100 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <SectionLabel>General</SectionLabel>
                <p className="mt-1 text-[12.5px] text-slate-500">
                  Basic clinic and receptionist connection settings.
                </p>
              </div>
              <Button type="button" variant="outline" disabled={saving} onClick={() => void saveGeneral()}>
                {saving ? "Saving…" : "Save general"}
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Clinic name">
                <Input value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
              </Field>
              <Field
                label="Inbound phone (E.164)"
                hint="Must already exist on your phone AI provider account."
              >
                <Input
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+14244849053"
                  className="font-mono"
                />
              </Field>
              <Field
                label="Existing agent ID (optional)"
                hint="Paste an agent ID to link an agent already created in the provider console."
              >
                <Input
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  placeholder="ae627ca8-…"
                  className="font-mono"
                />
              </Field>
              <Field label="Timezone" hint="From your doctor profile — edit under Availability / My profile.">
                <Input value={profile?.timezone || "America/Los_Angeles"} disabled />
              </Field>
            </div>
          </Panel>

          {/* Doctor & clinic CRM info */}
          <Panel className="space-y-4 border border-sky-100 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Stethoscope className="size-4 text-blue-600" />
                  <SectionLabel>Doctor & clinic information</SectionLabel>
                </div>
                <p className="mt-1 text-[12.5px] text-slate-500">
                  Pulled from your CRM profile. Sync pushes name, fee, and open slots into the receptionist.
                  Edit details on My profile or Availability — not duplicated here.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/doctor/profile">
                  <Button type="button" variant="outline" size="sm">
                    Edit profile
                  </Button>
                </Link>
                <Link to="/doctor/availability">
                  <Button type="button" variant="outline" size="sm">
                    Edit availability
                  </Button>
                </Link>
              </div>
            </div>
            {profile ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <InfoTile label="Doctor" value={profile.fullName} />
                <InfoTile label="Specialty" value={profile.specialty || "—"} />
                <InfoTile label="Consultation fee" value={profile.fee || "—"} />
                <InfoTile label="Clinic (profile)" value={profile.clinic || "—"} />
                <InfoTile label="Location / address" value={profile.location || "—"} />
                <InfoTile
                  label="Weekly hours"
                  value={profile.weeklyHoursSummary || "Not set"}
                />
              </div>
            ) : (
              <EmptyNote>Doctor profile could not be loaded.</EmptyNote>
            )}
          </Panel>

          {/* Languages & voice */}
          <Panel className="space-y-4 border border-sky-100 p-5">
            <div className="flex items-center gap-2">
              <Languages className="size-4 text-blue-600" />
              <SectionLabel>Languages & voice</SectionLabel>
            </div>
            <p className="text-[12.5px] text-slate-500">
              Only languages supported by the voice provider mapping are listed. Changes apply when you
              update the AI receptionist.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Receptionist language">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="h-12 w-full rounded-xl border-2 border-transparent bg-input-fill px-4 text-[13.5px] outline-none focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Voice ID (optional)"
                hint="Provider voice identifier. Leave blank to keep the default voice."
              >
                <Input
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  placeholder="EXAVITQu4vr4xnSDxMaL"
                  className="font-mono text-[13px]"
                />
              </Field>
            </div>
            <Button type="button" variant="outline" disabled={saving} onClick={() => void saveGeneral()}>
              {saving ? "Saving…" : "Save language & voice"}
            </Button>
          </Panel>

          {/* AI Agent */}
          <Panel className="space-y-4 border border-sky-100 p-5">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-blue-600" />
              <SectionLabel>AI receptionist</SectionLabel>
            </div>
            <p className="text-[12.5px] text-slate-500">
              Greeting and live system instructions. After Sync you should see “BOOKING OTP RULE — MANDATORY
              ORDER”, “RECORDS UPLOAD OFFER RULE”, and your current open slots.
            </p>
            <Field
              label="First message (greeting)"
              hint="Use {opening_doctor_line} for doctor name + fee in the opening line."
            >
              <Textarea
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                rows={3}
              />
            </Field>
            <Field
              label="Live system prompt (synced)"
              hint="Read-only view of what was last pushed to the agent. Use Sync availability & profile to refresh."
            >
              <Textarea
                value={systemPrompt}
                readOnly
                rows={12}
                className="bg-slate-50 font-mono text-[11.5px]"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={agentBusy || !settings?.synthflowConfigured}
                onClick={() => void createOrUpdateAgent()}
              >
                <Sparkles className="size-4" />
                {agentBusy
                  ? "Updating…"
                  : agentReady
                    ? "Update AI receptionist"
                    : "Create AI receptionist"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={syncBusy || !agentReady}
                onClick={() => void syncDirectory()}
              >
                <RefreshCw className="size-4" />
                {syncBusy ? "Syncing…" : "Sync availability & profile"}
              </Button>
            </div>
            <div className="space-y-2">
              {settings?.synthflowAgentId ? (
                <p className="rounded-xl border border-sky-100 bg-sky-50/50 px-3 py-2 font-mono text-[11.5px] text-slate-600">
                  Agent ID: {settings.synthflowAgentId}
                </p>
              ) : null}
              <p className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-[12.5px] text-slate-700">
                <span className="font-semibold text-slate-900">Last sync: </span>
                {settings?.synthflowSyncedAt
                  ? new Date(settings.synthflowSyncedAt).toLocaleString()
                  : "Never — use Sync availability & profile"}
              </p>
            </div>
          </Panel>

          {/* Appointment booking */}
          <Panel className="space-y-4 border border-sky-100 p-5">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-blue-600" />
              <SectionLabel>Appointment booking</SectionLabel>
            </div>
            <p className="text-[12.5px] text-slate-500">
              The receptionist books only against open slots generated from your Availability schedule. It
              confirms with OTP, and never overwrites booked visits. Manage hours and slots under
              Availability; then sync here.
            </p>
            <ul className="space-y-2 text-[13px] text-slate-700">
              <BookingRule>
                Availability comes from your weekly schedule, date overrides, and generated open slots.
              </BookingRule>
              <BookingRule>
                Callers hear live open times via availability check — not a static list.
              </BookingRule>
              <BookingRule>
                New bookings stay pending until the caller verifies the OTP with the agent.
              </BookingRule>
              <BookingRule>
                Confirm, cancel, complete, and follow-ups are managed in Appointments after the visit is
                booked.
              </BookingRule>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link to="/doctor/availability">
                <Button type="button" variant="outline" size="sm">
                  Open availability
                </Button>
              </Link>
              <Link to="/doctor/appointments/">
                <Button type="button" variant="outline" size="sm">
                  Open appointments
                </Button>
              </Link>
              <Button
                type="button"
                size="sm"
                disabled={syncBusy || !agentReady}
                onClick={() => void syncDirectory()}
              >
                {syncBusy ? "Syncing…" : "Sync slots to receptionist"}
              </Button>
            </div>
          </Panel>

          {/* Voice & calling / connection */}
          <Panel className="space-y-4 border border-sky-100 p-5">
            <div className="flex items-center gap-2">
              <Phone className="size-4 text-blue-600" />
              <SectionLabel>Voice & calling</SectionLabel>
            </div>
            <p className="text-[12.5px] text-slate-500">
              Connection endpoints used by the phone AI provider. These update automatically when you create
              or update the receptionist.
            </p>
            <Field label="Inbound webhook">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={settings?.webhookUrls.inbound || ""}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(settings?.webhookUrls.inbound || "")}
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
            </Field>
            <Field label="Post-call webhook">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={settings?.webhookUrls.data || ""}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(settings?.webhookUrls.data || "")}
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
            </Field>
            <p className="text-[12px] text-slate-500">
              Requires a public HTTPS API URL the provider can reach. After each call, booking and call
              metadata are posted to your backend.
            </p>
          </Panel>

          {/* Testing & call history */}
          <Panel className="space-y-4 border border-sky-100 p-5">
            <div className="flex items-center gap-2">
              <PhoneCall className="size-4 text-blue-600" />
              <SectionLabel>Test call</SectionLabel>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-4 space-y-3">
              <p className="text-[13px] font-semibold text-slate-900">Call my phone</p>
              <p className="text-[12.5px] text-slate-500">
                The clinic receptionist dials your mobile from{" "}
                <span className="font-mono text-slate-700">
                  {settings?.phoneNumber || "the clinic line"}
                </span>
                . Answer and ask to book — it should reply immediately with “Which day would you
                like your appointment?”
              </p>
              <Field label="Your mobile (with country code)">
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+14155550123"
                  inputMode="tel"
                  autoComplete="tel"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={testBusy || !testPhone.trim() || !settings?.synthflowAgentId}
                  onClick={() => void startTestCall()}
                >
                  <PhoneCall className={cn("size-3.5", testBusy && "animate-pulse")} />
                  {testBusy ? "Calling…" : "Call me now"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={healthBusy}
                  onClick={() => void verifyCallHealth()}
                >
                  <RefreshCw className={cn("size-3.5", healthBusy && "animate-spin")} />
                  {healthBusy ? "Checking…" : "Verify call path"}
                </Button>
              </div>
              {testCallStatus ? (
                <p className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-[12.5px] text-slate-700">
                  <span className="font-semibold capitalize">{testCallStatus}</span>
                  {testCallDetail ? ` — ${testCallDetail}` : ""}
                </p>
              ) : null}
              {healthSummary ? (
                <p className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-[12.5px] text-slate-700">
                  {healthSummary}
                </p>
              ) : null}
            </div>
            <div className="rounded-xl border border-dashed border-sky-200 bg-white/60 p-4">
              <p className="text-[12.5px] font-semibold text-slate-800">Or call the clinic line</p>
              <p className="mt-1 text-[12px] text-slate-500">
                Place a real inbound call to verify the same greeting and booking flow.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-sky-200 bg-white px-3 py-2 font-mono text-[13px] text-slate-800">
                  {settings?.phoneNumber || "Set inbound phone above"}
                </span>
                {settings?.phoneNumber ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyText(settings.phoneNumber)}
                  >
                    <Copy className="size-3.5" />
                    Copy number
                  </Button>
                ) : null}
              </div>
            </div>
            <p className="text-[12.5px] text-slate-500">
              Detailed voice-call transcripts and recordings are managed in the admin Voice calls area.
              Day-to-day clinic activity appears under Activity History.
            </p>
            <Link to="/doctor/activity">
              <Button type="button" variant="outline" size="sm">
                Open activity history
              </Button>
            </Link>
          </Panel>
        </div>
      )}
    </>
  );
}

function OverviewStat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-sky-100 bg-white px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-[13.5px] font-semibold text-slate-900",
          mono && "font-mono text-[12.5px]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/30 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-[13px] font-medium text-slate-800">{value}</p>
    </div>
  );
}

function BookingRule({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-blue-600" />
      <span>{children}</span>
    </li>
  );
}
