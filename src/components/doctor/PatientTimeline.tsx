import type { ReactNode } from "react";
import { Badge, Button, Panel, SectionLabel } from "@/components/ui/primitives";
import type { ApiAppointment, ApiPatientTimelineEvent } from "@/lib/api";
import { statusTone } from "@/lib/mock-data";

const kindLabel: Record<ApiPatientTimelineEvent["kind"], string> = {
  visit: "Visit",
  follow_up: "Follow-up",
  status: "Status",
  report: "Report",
  prescription: "Prescription",
  note: "Doctor note",
  transcription: "Transcription",
};

const kindTone: Record<ApiPatientTimelineEvent["kind"], "primary" | "warning" | "success" | "muted" | "accent"> = {
  visit: "primary",
  follow_up: "accent",
  status: "warning",
  report: "muted",
  prescription: "success",
  note: "primary",
  transcription: "accent",
};

function eventTone(event: ApiPatientTimelineEvent) {
  if (
    event.status === "confirmed" ||
    event.status === "pending" ||
    event.status === "completed" ||
    event.status === "cancelled"
  ) {
    return statusTone[event.status];
  }
  return kindTone[event.kind];
}

function groupByDate(events: ApiPatientTimelineEvent[]) {
  const groups: Array<{ date: string; events: ApiPatientTimelineEvent[] }> = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (!last || last.date !== event.dateLabel) {
      groups.push({ date: event.dateLabel, events: [event] });
    } else {
      last.events.push(event);
    }
  }
  return groups;
}

export function PatientTimeline({
  events,
  appointments,
  onViewRecord,
  renderVisitActions,
}: {
  events: ApiPatientTimelineEvent[];
  appointments: ApiAppointment[];
  onViewRecord: (recordId: string) => void;
  renderVisitActions: (appointment: ApiAppointment) => ReactNode;
}) {
  const groups = groupByDate(events);
  if (!groups.length) {
    return (
      <Panel className="p-4">
        <p className="text-sm text-muted-foreground">No visits, notes, reports, or calls on this profile yet.</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.date} className="space-y-3">
          <SectionLabel>{group.date}</SectionLabel>
          {group.events.map((event) => {
            const appointment = event.appointmentId
              ? appointments.find((row) => row.id === event.appointmentId)
              : undefined;
            const showActions = (event.kind === "visit" || event.kind === "follow_up") && appointment;
            return (
              <Panel key={event.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{event.title}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{event.timeLabel}</p>
                  </div>
                  <Badge tone={eventTone(event)}>
                    {event.status || kindLabel[event.kind]}
                  </Badge>
                </div>
                {event.kind === "transcription" ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-primary">Read transcription</summary>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{event.detail}</p>
                  </details>
                ) : (
                  <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{event.detail}</p>
                )}
                {event.recordId ? (
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={() => onViewRecord(event.recordId!)}>
                      View file
                    </Button>
                  </div>
                ) : null}
                {showActions ? <div className="mt-3 border-t border-border pt-3">{renderVisitActions(appointment)}</div> : null}
              </Panel>
            );
          })}
        </section>
      ))}
    </div>
  );
}
