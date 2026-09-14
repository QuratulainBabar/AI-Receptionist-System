import { createFileRoute, Link } from "@tanstack/react-router";
import { AppointmentCard } from "@/components/shared/cards";
import { Button, PageHeader, SectionLabel } from "@/components/ui/primitives";
import { appointments, currentPatient } from "@/lib/mock-data";

export const Route = createFileRoute("/patient/appointments")({
  head: () => ({
    meta: [
      { title: "My appointments — AI Receptionist" },
      { name: "description", content: "Upcoming and past appointments with their status and reference numbers." },
      { property: "og:title", content: "My appointments — AI Receptionist" },
      { property: "og:description", content: "Track upcoming visits and review your appointment history." },
    ],
  }),
  component: MyAppointments,
});

function MyAppointments() {
  const mine = appointments.filter((a) => a.patientId === currentPatient.id);
  const upcoming = mine.filter((a) => a.status === "confirmed" || a.status === "pending");
  const past = mine.filter((a) => a.status === "completed" || a.status === "cancelled");

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="My appointments"
        actions={
          <Link to="/patient/book">
            <Button>Book another</Button>
          </Link>
        }
      />

      <section className="space-y-3">
        <SectionLabel>Upcoming</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          {upcoming.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} />
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <SectionLabel>Past</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          {past.map((appointment) => (
            <AppointmentCard key={appointment.id} appointment={appointment} />
          ))}
        </div>
      </section>
    </>
  );
}
