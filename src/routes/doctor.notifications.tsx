import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { doctorNotificationsApi, formatApiError, type ApiDoctorNotification } from "@/lib/api";

export const Route = createFileRoute("/doctor/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — AI Receptionist" },
      { name: "description", content: "New bookings, reschedules, cancellations and report uploads." },
      { property: "og:title", content: "Notifications — AI Receptionist" },
      { property: "og:description", content: "Stay on top of schedule changes and patient uploads." },
    ],
  }),
  component: DoctorNotifications,
});

const kindTone: Record<ApiDoctorNotification["kind"], "success" | "warning" | "destructive"> = {
  new: "success",
  changed: "warning",
  cancelled: "destructive",
};

const kindLabel: Record<ApiDoctorNotification["kind"], string> = {
  new: "New",
  changed: "Changed",
  cancelled: "Cancelled",
};

function DoctorNotifications() {
  const [notifications, setNotifications] = useState<ApiDoctorNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void doctorNotificationsApi
      .list()
      .then((result) => {
        if (!cancelled) setNotifications(result.notifications);
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load notifications."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Doctor"
        title="Notifications"
        description="Appointment alerts from the receptionist — nothing is pushed in this preview."
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <EmptyNote>Loading notifications…</EmptyNote>
      ) : notifications.length === 0 ? (
        <EmptyNote>No notifications yet. New bookings and patient uploads will appear here.</EmptyNote>
      ) : (
        <div className="space-y-3">
          {notifications.map((note) => (
            <Panel key={note.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SectionLabel>{kindLabel[note.kind]}</SectionLabel>
                  <p className="mt-1 truncate text-sm font-semibold">{note.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{note.detail}</p>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">{note.time}</p>
                </div>
                <Badge tone={kindTone[note.kind]}>{kindLabel[note.kind]}</Badge>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
