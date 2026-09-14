import { createFileRoute } from "@tanstack/react-router";
import { Badge, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { followUps } from "@/lib/mock-data";

export const Route = createFileRoute("/patient/messages")({
  head: () => ({
    meta: [
      { title: "Follow-up messages — AI Receptionist" },
      { name: "description", content: "Confirmation emails, reminders and follow-up notices about your care." },
      { property: "og:title", content: "Follow-up messages — AI Receptionist" },
      { property: "og:description", content: "Every confirmation and reminder the receptionist has sent you." },
    ],
  }),
  component: FollowUpMessages,
});

function FollowUpMessages() {
  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="Follow-up messages"
        description="Sample email and SMS notices — nothing is actually sent from this preview."
      />

      <div className="space-y-3">
        {followUps.map((message) => (
          <Panel key={message.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SectionLabel>{message.channel}</SectionLabel>
                <p className="mt-1 truncate text-sm font-semibold">{message.subject}</p>
                <p className="mt-1 text-sm text-muted-foreground">{message.preview}</p>
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">{message.sentAt}</p>
              </div>
              <Badge tone={message.status === "Scheduled" ? "warning" : "success"}>{message.status}</Badge>
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
