import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge, Button, EmptyNote, Input, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { adminApi, formatApiError, type AdminVoiceCall, type AdminVoiceCallDetail } from "@/lib/api";

export const Route = createFileRoute("/admin/voice-calls")({
  head: () => ({
    meta: [{ title: "Phone calls — Super Admin" }],
  }),
  component: AdminVoiceCallsPage,
});

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function formatDuration(seconds: number | null) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return rem ? `${mins}m ${rem}s` : `${mins}m`;
}

function statusTone(status: string): "success" | "warning" | "destructive" | "muted" | "primary" {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "destructive";
    case "CANCELLED":
      return "warning";
    case "IN_PROGRESS":
    case "RINGING":
      return "primary";
    default:
      return "muted";
  }
}

function CallRecordingPlayer({
  callId,
  recordingUrl,
}: {
  callId: string;
  recordingUrl: string | null;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const directUrl = recordingUrl?.trim() || "";
  const hasRecording = Boolean(directUrl);

  useEffect(() => {
    if (!hasRecording) {
      setObjectUrl(null);
      setError("");
      setLoading(false);
      return;
    }

    // Prefer the real Synthflow/Twilio recording URL first for instant playback.
    setObjectUrl(null);
    setError("");
    setLoading(false);

    let cancelled = false;
    let createdUrl: string | null = null;

    // Also prepare an authenticated proxy blob as fallback (helps with some CORS hosts).
    setLoading(true);
    void adminApi
      .getVoiceCallRecordingObjectUrl(callId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setObjectUrl(url);
      })
      .catch(() => {
        // Direct URL playback below still works when proxy fails.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [callId, hasRecording, directUrl]);

  if (!hasRecording) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        No recording URL is available for this call yet. Recordings appear after Synthflow finishes uploading the call audio.
      </p>
    );
  }

  const playbackSrc = objectUrl || directUrl;

  return (
    <div className="mt-2 space-y-3">
      <audio key={playbackSrc} controls preload="metadata" className="w-full" src={playbackSrc}>
        Your browser does not support audio playback.
      </audio>

      <a
        href={directUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Listen to call recording
      </a>

      <p className="break-all font-mono text-[11px] text-muted-foreground">{directUrl}</p>

      {loading ? <p className="text-xs text-muted-foreground">Preparing secure playback…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function AdminVoiceCallsPage() {
  const [calls, setCalls] = useState<AdminVoiceCall[]>([]);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminVoiceCallDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  async function load(nextQ = appliedQ) {
    setLoading(true);
    setError("");
    try {
      const result = await adminApi.listVoiceCalls({ q: nextQ || undefined, limit: 100 });
      setCalls(result.calls);
    } catch (err) {
      setError(formatApiError(err, "Unable to load phone calls."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError("");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    void adminApi
      .getVoiceCall(selectedId)
      .then((result) => {
        if (!cancelled) setDetail(result.call);
      })
      .catch((err) => {
        if (!cancelled) setDetailError(formatApiError(err, "Unable to load call details."));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  return (
    <>
      <PageHeader
        eyebrow="Phone AI"
        title="Voice calls"
        description="Every Synthflow AI receptionist call — caller, status, booking, recording, and conversation details."
      />

      <Panel className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Search name, phone, patient, doctor, or appointment reference"
            className="sm:flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setAppliedQ(q);
                void load(q);
              }
            }}
          />
          <Button
            type="button"
            onClick={() => {
              setAppliedQ(q);
              void load(q);
            }}
          >
            Search
          </Button>
        </div>
      </Panel>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading && !calls.length ? (
        <EmptyNote>Loading calls…</EmptyNote>
      ) : !calls.length ? (
        <EmptyNote>No voice calls yet. Calls appear here automatically after Synthflow handles them.</EmptyNote>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Caller</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Recording</th>
                <th className="px-3 py-2 font-medium">Appointment</th>
                <th className="px-3 py-2 font-medium">Summary</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {calls.map((call) => {
                const displayName = call.callerName || call.patientName;
                return (
                  <tr key={call.id} className="border-t border-border hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2">
                      {formatWhen(call.endedAt || call.startedAt || call.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      {displayName ? (
                        <span>
                          {displayName}
                          {call.patientReference ? (
                            <span className="ml-1 text-muted-foreground">({call.patientReference})</span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{call.fromNumber || "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={statusTone(call.status)}>{call.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {formatDuration(call.durationSeconds)}
                    </td>
                    <td className="px-3 py-2">
                      {call.recordingUrl ? (
                        <a
                          href={call.recordingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Listen
                        </a>
                      ) : call.hasRecording ? (
                        <Badge tone="success">Available</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {call.appointmentReference ? (
                        <span>
                          <span className="font-medium">{call.appointmentReference}</span>
                          {call.appointmentDate ? (
                            <span className="block text-xs text-muted-foreground">
                              {call.appointmentDate} · {call.appointmentTime}
                            </span>
                          ) : null}
                          {call.doctorName ? (
                            <span className="block text-xs text-muted-foreground">{call.doctorName}</span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-[14rem] truncate px-3 py-2 text-muted-foreground" title={call.summary}>
                      {call.summary || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" variant="soft" size="sm" onClick={() => setSelectedId(call.id)}>
                        Details
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Call details</DialogTitle>
            <DialogDescription>
              Synthflow call record with booking, recording playback, and conversation information.
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <EmptyNote>Loading call…</EmptyNote>
          ) : detailError ? (
            <p className="text-sm text-destructive">{detailError}</p>
          ) : detail ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem label="Caller name" value={detail.callerName || detail.patientName || "—"} />
                <DetailItem label="Phone number" value={detail.fromNumber || "—"} mono />
                <DetailItem label="Clinic line" value={detail.toNumber || "—"} mono />
                <DetailItem label="Status" value={detail.status} />
                <DetailItem
                  label="Call date/time"
                  value={formatWhen(detail.endedAt || detail.startedAt || detail.createdAt)}
                />
                <DetailItem label="Duration" value={formatDuration(detail.durationSeconds)} />
                <DetailItem label="Direction" value={detail.direction} />
                <DetailItem label="End reason" value={detail.endCallReason || "—"} />
                {detail.synthflowCallId ? (
                  <DetailItem label="Synthflow call ID" value={detail.synthflowCallId} mono />
                ) : null}
                {detail.patientReference ? (
                  <DetailItem label="Patient reference" value={detail.patientReference} />
                ) : null}
              </div>

              <div>
                <SectionLabel>Call recording</SectionLabel>
                <CallRecordingPlayer callId={detail.id} recordingUrl={detail.recordingUrl} />
              </div>

              <div>
                <SectionLabel>Summary</SectionLabel>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                  {detail.summary || "No summary available."}
                </p>
              </div>

              {detail.appointment || detail.appointmentReference ? (
                <div>
                  <SectionLabel>Appointment booked</SectionLabel>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <DetailItem
                      label="Reference"
                      value={detail.appointment?.reference || detail.appointmentReference || "—"}
                    />
                    <DetailItem
                      label="Doctor"
                      value={detail.appointment?.doctorName || detail.doctorName || "—"}
                    />
                    <DetailItem
                      label="When"
                      value={
                        detail.appointment
                          ? `${detail.appointment.date} · ${detail.appointment.time}`
                          : detail.appointmentDate
                            ? `${detail.appointmentDate} · ${detail.appointmentTime}`
                            : "—"
                      }
                    />
                    <DetailItem
                      label="Specialty"
                      value={detail.appointment?.specialty || detail.appointmentSpecialty || "—"}
                    />
                    <DetailItem
                      label="Clinic"
                      value={detail.appointment?.clinic || detail.appointmentClinic || "—"}
                    />
                    <DetailItem
                      label="Reason"
                      value={detail.appointment?.reason || detail.appointmentReason || "—"}
                    />
                  </div>
                </div>
              ) : null}

              <div>
                <SectionLabel>Transcript</SectionLabel>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
                  {detail.transcript?.trim() || "No transcript available for this call."}
                </pre>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</p>
    </div>
  );
}
