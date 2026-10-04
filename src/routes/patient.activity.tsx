import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { activityApi, formatApiError, type ApiActivity } from "@/lib/api";

export const Route = createFileRoute("/patient/activity")({
  head: () => ({
    meta: [
      { title: "Activity history — AI Receptionist" },
      { name: "description", content: "A timeline of your bookings, uploads and visits." },
      { property: "og:title", content: "Activity history — AI Receptionist" },
      { property: "og:description", content: "Everything that happened on your account, most recent first." },
    ],
  }),
  component: PatientActivity,
});

function PatientActivity() {
  const [activities, setActivities] = useState<ApiActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void activityApi
      .list()
      .then((result) => {
        if (!cancelled) setActivities(result.activities);
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load activity history."));
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
      <PageHeader eyebrow="Patient" title="Activity history" description="Most recent first." />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <Panel className="p-4">
        <SectionLabel>Timeline</SectionLabel>
        {loading ? (
          <div className="mt-4">
            <EmptyNote>Loading activity…</EmptyNote>
          </div>
        ) : activities.length === 0 ? (
          <div className="mt-4">
            <EmptyNote>No activity yet. Book a visit or upload a report to get started.</EmptyNote>
          </div>
        ) : (
          <ol className="mt-4 space-y-4 border-l border-border pl-4">
            {activities.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" />
                <p className="text-[13px] font-medium">{entry.label}</p>
                <p className="text-sm text-muted-foreground">{entry.detail}</p>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{entry.time}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </>
  );
}
