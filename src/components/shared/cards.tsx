import { Link } from "@tanstack/react-router";
import { Avatar, Badge, Button, Panel, SectionLabel } from "@/components/ui/primitives";
import type { ApiAppointment, ApiDoctor } from "@/lib/api";
import { initials, statusTone, type Appointment, type Doctor } from "@/lib/mock-data";
import { Calendar, Clock, ArrowRight, Star, MapPin, Phone, MessageSquare } from "lucide-react";

export function AppointmentCard({
  appointment,
  perspective = "patient",
}: {
  appointment: Appointment | ApiAppointment;
  perspective?: "patient" | "doctor";
}) {
  const who = perspective === "patient" ? appointment.doctorName : appointment.patientName;
  return (
    <div
      className="rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5 group"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
        border: "1px solid #EEF2F7",
        boxShadow: "0 1px 2px 0 rgba(15,23,42,0.03), 0 8px 20px -16px rgba(15,23,42,0.1)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5 flex-1">
          <Avatar label={initials(who)} size="md" className="size-11" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-2 justify-between">
              <div className="min-w-0">
                <p className="truncate text-[14.5px] font-extrabold tracking-tight text-foreground">
                  {who}
                </p>
                <p
                  className="mt-0.5 text-[12.5px] font-semibold text-muted-foreground"
                  style={{ color: "#64748B" }}
                >
                  {perspective === "patient" ? appointment.speciality : appointment.reason}
                </p>
              </div>
              <Badge
                tone={statusTone[appointment.status]}
                dot
                className="px-3 py-1 rounded-full text-[10.5px] shrink-0"
              >
                {appointment.status}
              </Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-1.5">
                <Calendar className="size-3.5 text-blue-600" strokeWidth={2.2} />
                <span className="font-mono text-[11.5px] font-bold text-foreground">
                  {appointment.date}
                </span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-1.5">
                <Clock className="size-3.5 text-emerald-600" strokeWidth={2.2} />
                <span className="font-mono text-[11.5px] font-bold text-foreground">
                  {appointment.time} · {appointment.duration}
                </span>
              </span>
            </div>
            {"isFollowUp" in appointment && appointment.isFollowUp ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3 py-1.5 text-[11.5px] font-bold text-blue-700">
                <MessageSquare className="size-3.5" strokeWidth={2.3} />
                Follow-up of {appointment.followUpOfReference || "prior visit"}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4.5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#F1F5F9]">
        <span className="inline-flex items-center gap-2 font-mono text-[11.5px] font-semibold text-muted-foreground">
          <span className="size-1.5 rounded-full bg-blue-500" />
          {appointment.reference}
          <span className="text-muted-foreground/60">·</span>
          {appointment.mode}
        </span>
        {perspective === "patient" ? (
          <Link
            to="/patient/appointments/$appointmentId"
            params={{ appointmentId: appointment.id }}
          >
            <Button variant="outline" size="sm" className="rounded-xl !h-9 px-4">
              View details
              <ArrowRight className="size-4" strokeWidth={2.3} />
            </Button>
          </Link>
        ) : (
          <Link
            to="/doctor/patients/$patientId"
            params={{ patientId: (appointment as ApiAppointment).patientId }}
          >
            <Button size="sm" className="rounded-xl !h-9 px-4">
              Patient file
              <ArrowRight className="size-4" strokeWidth={2.3} />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export function DoctorCard({ doctor }: { doctor: Doctor | ApiDoctor }) {
  return (
    <div
      className="rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 group"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
        border: "1px solid #EEF2F7",
        boxShadow: "0 1px 2px 0 rgba(15,23,42,0.03), 0 12px 28px -18px rgba(15,23,42,0.14)",
      }}
    >
      <div className="flex items-start gap-4">
        <Avatar label={initials(doctor.name)} size="lg" className="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-extrabold tracking-tight text-foreground">
                {doctor.name}
              </p>
              <p
                className="mt-0.5 text-[12.5px] font-semibold text-muted-foreground"
                style={{ color: "#64748B" }}
              >
                {doctor.speciality} · {doctor.experience}
              </p>
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground/80">
                <MapPin className="size-3.5" strokeWidth={2.2} />
                {doctor.clinic}
              </p>
            </div>
            <Badge
              tone="success"
              dot
              className="px-3 py-1 rounded-full text-[10.5px] shrink-0 flex items-center gap-1.5"
            >
              <Star className="size-3" fill="currentColor" />
              {doctor.rating}
            </Badge>
          </div>
        </div>
      </div>
      <div className="mt-4.5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-[#F1F5F9]">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-blue-50 px-3.5 py-2 text-[11.5px] font-extrabold text-blue-700">
          <Calendar className="size-3.5" strokeWidth={2.3} />
          Next: {doctor.nextAvailable}
        </span>
        <div className="flex gap-2">
          <Link to="/patient/doctors/$doctorId" params={{ doctorId: doctor.id }}>
            <Button variant="outline" size="sm" className="rounded-xl !h-9 px-4">
              Details
            </Button>
          </Link>
          <Link to="/patient/book" search={{ doctorId: doctor.id }}>
            <Button size="sm" className="rounded-xl !h-9 px-4">
              <Phone className="size-3.5" strokeWidth={2.3} />
              Book
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
        border: "1px solid #EEF2F7",
        boxShadow: "0 1px 2px 0 rgba(15,23,42,0.03), 0 8px 20px -16px rgba(15,23,42,0.1)",
      }}
    >
      <SectionLabel className="text-[11px]">{title}</SectionLabel>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li
            key={item}
            className="flex items-start gap-3 text-[13px] font-semibold text-foreground leading-relaxed"
          >
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-500" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
