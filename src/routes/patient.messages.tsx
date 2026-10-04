import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { formatApiError, messagesApi, type ApiFollowUpMessage } from "@/lib/api";

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

function statusTone(status: ApiFollowUpMessage["status"]) {
  if (status === "Scheduled") return "warning" as const;
  if (status === "Opened") return "accent" as const;
  return "success" as const;
}

function FollowUpMessages() {
  const [messages, setMessages] = useState<ApiFollowUpMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void messagesApi
      .list()
      .then((result) => {
        if (!cancelled) setMessages(result.messages);
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load follow-up messages."));
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
        eyebrow="Patient"
        title="Follow-up messages"
        description="Confirmations, reminders and follow-up notices for your appointments."
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <EmptyNote>Loading messages…</EmptyNote>
      ) : messages.length === 0 ? (
        <EmptyNote>No follow-up messages yet. Book an appointment to receive confirmations and reminders.</EmptyNote>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => (
            <Panel key={message.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SectionLabel>{message.channel}</SectionLabel>
                  <p className="mt-1 truncate text-sm font-semibold">{message.subject}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{message.preview}</p>
                  <p className="mt-2 font-mono text-[10px] text-muted-foreground">{message.sentAt}</p>
                </div>
                <Badge tone={statusTone(message.status)}>{message.status}</Badge>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
