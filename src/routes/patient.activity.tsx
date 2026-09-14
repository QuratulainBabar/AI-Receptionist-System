import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { activityLog } from "@/lib/mock-data";

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
  return (
    <>
      <PageHeader eyebrow="Patient" title="Activity history" description="Most recent first." />

      <Panel className="p-4">
        <SectionLabel>Timeline</SectionLabel>
        <ol className="mt-4 space-y-4 border-l border-border pl-4">
          {activityLog.map((entry) => (
            <li key={entry.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" />
              <p className="text-[13px] font-medium">{entry.label}</p>
              <p className="text-sm text-muted-foreground">{entry.detail}</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{entry.time}</p>
            </li>
          ))}
        </ol>
      </Panel>
    </>
  );
}
