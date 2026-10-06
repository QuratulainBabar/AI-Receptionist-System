import { Link } from "@tanstack/react-router";
import { Avatar, Badge, Button, Panel, SectionLabel } from "@/components/ui/primitives";
import type { ApiAppointment, ApiDoctor } from "@/lib/api";
import { initials, statusTone, type Appointment, type Doctor } from "@/lib/mock-data";

export function AppointmentCard({
  appointment,
  perspective = "patient",
}: {
  appointment: Appointment | ApiAppointment;
  perspective?: "patient" | "doctor";
}) {
  const who = perspective === "patient" ? appointment.doctorName : appointment.patientName;
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar label={initials(who)} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{who}</p>
            <p className="text-xs text-muted-foreground">
              {perspective === "patient" ? appointment.speciality : appointment.reason}
            </p>
            <p className="mt-2 font-mono text-[11px] text-foreground">
              {appointment.date} · {appointment.time} · {appointment.duration}
            </p>
            {"isFollowUp" in appointment && appointment.isFollowUp ? (
              <p className="mt-1 text-[11px] text-primary">
                Follow-up of {appointment.followUpOfReference || "prior visit"}
              </p>
            ) : null}
          </div>
        </div>
        <Badge tone={statusTone[appointment.status]}>{appointment.status}</Badge>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="font-mono text-[11px] text-muted-foreground">
          {appointment.reference} · {appointment.mode}
        </span>
        {perspective === "patient" ? (
          <Link to="/patient/appointments/$appointmentId" params={{ appointmentId: appointment.id }}>
            <Button variant="outline" size="sm">
              Details
            </Button>
          </Link>
        ) : (
          <Link to="/doctor/patients/$patientId" params={{ patientId: appointment.patientId }}>
            <Button variant="outline" size="sm">
              Patient file
            </Button>
          </Link>
        )}
      </div>
    </Panel>
  );
}

export function DoctorCard({ doctor }: { doctor: Doctor | ApiDoctor }) {
  return (
    <Panel className="p-4">
      <div className="flex items-start gap-3">
        <Avatar label={initials(doctor.name)} className="size-11" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{doctor.name}</p>
          <p className="text-xs text-muted-foreground">
            {doctor.speciality} · {doctor.experience}
          </p>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{doctor.clinic}</p>
        </div>
        <Badge tone="success">{doctor.rating}</Badge>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="font-mono text-[11px] text-primary">Next: {doctor.nextAvailable}</span>
        <div className="flex gap-2">
          <Link to="/patient/doctors/$doctorId" params={{ doctorId: doctor.id }}>
            <Button variant="outline" size="sm">
              Details
            </Button>
          </Link>
          <Link to="/patient/book" search={{ doctorId: doctor.id }}>
            <Button size="sm">Book</Button>
          </Link>
        </div>
      </div>
    </Panel>
  );
}

export function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <Panel className="p-4">
      <SectionLabel>{title}</SectionLabel>
      <ul className="mt-2.5 space-y-1.5 text-sm text-foreground">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
