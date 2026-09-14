import { createFileRoute, Link } from "@tanstack/react-router";
import { AppointmentCard } from "@/components/shared/cards";
import { Button, PageHeader, Panel, SectionLabel, StatCard } from "@/components/ui/primitives";
import { appointments, currentPatient, followUps, specialities } from "@/lib/mock-data";

export const Route = createFileRoute("/patient/")({
  head: () => ({
    meta: [
      { title: "Patient dashboard — AI Receptionist" },
      { name: "description", content: "Your upcoming visits, follow-up messages and quick actions." },
      { property: "og:title", content: "Patient dashboard — AI Receptionist" },
      { property: "og:description", content: "See your next appointment and start a chat with the receptionist." },
    ],
  }),
  component: PatientDashboard,
});

const quickActions = [
  { to: "/patient/chat", label: "Ask the receptionist" },
  { to: "/patient/doctors", label: "Find a doctor" },
  { to: "/patient/records", label: "Upload a report" },
  { to: "/patient/history", label: "Update history" },
] as const;

function PatientDashboard() {
  const mine = appointments.filter((a) => a.patientId === currentPatient.id);
  const upcoming = mine.filter((a) => a.status === "confirmed" || a.status === "pending");

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title={`Good morning, ${currentPatient.name.split(" ")[0]}`}
        description="Here's where your care stands today."
        actions={
          <Link to="/patient/book">
            <Button>Book appointment</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Next appointment" value="Mon 15 Sep" detail="Dr. Daniel Osei · 10:30 AM" />
        <StatCard label="Follow-up due" value="2 weeks" detail="Blood pressure recheck" />
        <StatCard label="Unread messages" value={String(followUps.length)} detail="Confirmations and reminders" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <SectionLabel>Upcoming appointments</SectionLabel>
          {upcoming.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} />
          ))}
        </section>

        <aside className="space-y-4">
          <Panel className="p-4">
            <SectionLabel>Quick actions</SectionLabel>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <Link key={action.to} to={action.to}>
                  <Button variant="outline" size="sm" className="h-auto w-full justify-start py-2.5 text-left">
                    {action.label}
                  </Button>
                </Link>
              ))}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Popular specialities</SectionLabel>
            <ul className="mt-3 space-y-2">
              {specialities.slice(0, 4).map((speciality) => (
                <li key={speciality.id} className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px]">{speciality.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{speciality.doctors}</span>
                </li>
              ))}
            </ul>
            <Link to="/patient/doctors">
              <Button variant="soft" size="sm" className="mt-3 w-full">
                Browse all
              </Button>
            </Link>
          </Panel>
        </aside>
      </div>
    </>
  );
}
