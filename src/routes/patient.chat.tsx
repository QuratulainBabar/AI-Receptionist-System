import { createFileRoute } from "@tanstack/react-router";
import { Avatar, Badge, Button, Input, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { chatTranscript, doctors, initials, suggestedPrompts, timeSlots } from "@/lib/mock-data";

export const Route = createFileRoute("/patient/chat")({
  head: () => ({
    meta: [
      { title: "AI Receptionist chat — AI Receptionist" },
      {
        name: "description",
        content: "Ask about specialities, find an available doctor and book an appointment by chat.",
      },
      { property: "og:title", content: "AI Receptionist chat" },
      { property: "og:description", content: "A guided conversation from question to confirmed appointment." },
    ],
  }),
  component: PatientChat,
});

function PatientChat() {
  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="AI Receptionist"
        description="Sample conversation using demo data — no live assistant is connected yet."
      />

      <Panel className="flex h-[calc(100vh-16rem)] min-h-[520px] flex-col p-0">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
          <Avatar label="AR" className="size-9 bg-primary text-primary-foreground" />
          <div className="leading-tight">
            <p className="text-[13px] font-semibold">Clinic receptionist</p>
            <p className="font-mono text-[10px] text-muted-foreground">Reception · demo mode</p>
          </div>
          <Badge tone="success" className="ml-auto">
            Online
          </Badge>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-muted/40 p-4">
          {chatTranscript.map((message) => (
            <div
              key={message.id}
              className={cn("flex gap-2.5", message.from === "patient" ? "justify-end" : "justify-start")}
            >
              {message.from === "ai" ? <Avatar label="AR" className="size-7 bg-primary text-primary-foreground" /> : null}
              <div className={cn("min-w-0 max-w-[80%] space-y-2", message.from === "patient" && "text-right")}>
                <div
                  className={cn(
                    "inline-block rounded-xl px-3.5 py-2.5 text-left text-[13px] leading-relaxed",
                    message.from === "patient"
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm border border-border bg-card text-foreground",
                  )}
                >
                  {message.text}
                </div>

                {message.card?.kind === "doctor" ? <ChatDoctorCard doctorId={message.card.doctorId} /> : null}
                {message.card?.kind === "slots" ? <ChatSlots /> : null}
                {message.card?.kind === "confirmation" ? (
                  <ChatConfirmation reference={message.card.reference} />
                ) : null}

                <p className="font-mono text-[10px] text-muted-foreground">{message.time}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {suggestedPrompts.map((prompt) => (
              <Button key={prompt} variant="outline" size="sm" type="button">
                {prompt}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Ask about specialities, doctors or times…" />
            <Button type="button">Send</Button>
          </div>
          <p className="mt-2 px-1 font-mono text-[10px] text-muted-foreground">
            General guidance only, not medical advice.
          </p>
        </div>
      </Panel>
    </>
  );
}

function ChatDoctorCard({ doctorId }: { doctorId: string }) {
  const doctor = doctors.find((d) => d.id === doctorId);
  if (!doctor) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-left">
      <div className="flex items-center gap-3">
        <Avatar label={initials(doctor.name)} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{doctor.name}</p>
          <p className="font-mono text-[10px] text-muted-foreground">
            {doctor.speciality} · {doctor.rating} ({doctor.reviews})
          </p>
        </div>
      </div>
      <p className="mt-2 font-mono text-[11px] text-primary">Next: {doctor.nextAvailable}</p>
    </div>
  );
}

function ChatSlots() {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-left">
      <SectionLabel>Mon 15 Sep · Dr. Daniel Osei</SectionLabel>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {timeSlots.slice(0, 6).map((slot) => (
          <button
            key={slot.id}
            type="button"
            disabled={!slot.available}
            className={cn(
              "rounded-md border py-2 font-mono text-[11px] transition-colors",
              slot.id === "1030"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              !slot.available && "opacity-40",
            )}
          >
            {slot.time}
          </button>
        ))}
      </div>
      <Button size="sm" className="mt-3 w-full">
        Confirm 10:30 AM
      </Button>
    </div>
  );
}

function ChatConfirmation({ reference }: { reference: string }) {
  return (
    <div className="rounded-xl border border-success/40 bg-success/8 p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>Appointment confirmed</SectionLabel>
        <Badge tone="success">{reference}</Badge>
      </div>
      <p className="mt-2 text-[13px]">Mon 15 Sep 2026 · 10:30 AM · Northgate Medical Centre, Room 4</p>
    </div>
  );
}
