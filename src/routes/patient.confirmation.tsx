import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, Button, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { appointments, followUps } from "@/lib/mock-data";

export const Route = createFileRoute("/patient/confirmation")({
  head: () => ({
    meta: [
      { title: "Appointment confirmed — AI Receptionist" },
      { name: "description", content: "Your appointment reference, time, place and what to bring." },
      { property: "og:title", content: "Appointment confirmed — AI Receptionist" },
      { property: "og:description", content: "Confirmation details and follow-up reminders for your visit." },
    ],
  }),
  component: Confirmation,
});

function Confirmation() {
  const appointment = appointments[0]!;

  return (
    <>
      <PageHeader eyebrow="Patient" title="Appointment confirmed" description="Your visit is booked and reminders are scheduled." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="border-success/40 bg-success/8 p-5">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Confirmation</SectionLabel>
              <Badge tone="success">{appointment.reference}</Badge>
            </div>
            <p className="mt-3 font-display text-xl font-semibold">
              {appointment.date} · {appointment.time}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {appointment.doctorName} · {appointment.speciality} · Northgate Medical Centre, Room 4
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/patient/appointments">
                <Button variant="outline" size="sm">
                  My appointments
                </Button>
              </Link>
              <Link to="/patient/records">
                <Button variant="outline" size="sm">
                  Upload a report
                </Button>
              </Link>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Before you arrive</SectionLabel>
            <ul className="mt-2.5 space-y-1.5 text-sm">
              <li>Arrive 10 minutes early for check-in.</li>
              <li>Bring your current medication list.</li>
              <li>Upload recent test results so the doctor can review them first.</li>
            </ul>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <SectionLabel>Messages queued</SectionLabel>
            <ul className="mt-3 space-y-3">
              {followUps.slice(0, 2).map((item) => (
                <li key={item.id}>
                  <p className="text-[13px] font-medium">{item.subject}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {item.channel} · {item.status}
                  </p>
                </li>
              ))}
            </ul>
            <Link to="/patient/messages">
              <Button variant="soft" size="sm" className="mt-3 w-full">
                View all messages
              </Button>
            </Link>
          </Panel>
        </aside>
      </div>
    </>
  );
}
