import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar, Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import {
  doctorsApi,
  formatApiError,
  type ApiAvailabilityDate,
  type ApiDoctor,
  type ApiTimeSlot,
} from "@/lib/api";
import { initials } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/patient/doctors/$doctorId")({
  head: () => ({
    meta: [
      { title: "Doctor profile — AI Receptionist" },
      { name: "description", content: "View doctor details and available appointment slots." },
    ],
  }),
  component: DoctorDetails,
});

function DoctorDetails() {
  const { doctorId } = Route.useParams();
  const [doctor, setDoctor] = useState<ApiDoctor | null>(null);
  const [dates, setDates] = useState<ApiAvailabilityDate[]>([]);
  const [timeSlots, setTimeSlots] = useState<ApiTimeSlot[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDoctor() {
      setLoading(true);
      setError("");
      try {
        const [doctorResult, availabilityResult] = await Promise.all([
          doctorsApi.get(doctorId),
          doctorsApi.availability(doctorId),
        ]);
        if (cancelled) return;
        setDoctor(doctorResult.doctor);
        setDates(availabilityResult.availability.dates);
        setSelectedDate(availabilityResult.availability.selectedDate);
        setTimeSlots(availabilityResult.availability.timeSlots);
      } catch (err) {
        if (!cancelled) setError(formatApiError(err, "Unable to load doctor profile."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDoctor();
    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  useEffect(() => {
    if (!selectedDate || !doctor) return;
    let cancelled = false;

    async function loadSlots() {
      try {
        const result = await doctorsApi.availability(doctorId, selectedDate ?? undefined);
        if (cancelled) return;
        setTimeSlots(result.availability.timeSlots);
      } catch (err) {
        if (!cancelled) setError(formatApiError(err, "Unable to load availability."));
      }
    }

    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [doctorId, selectedDate, doctor]);

  if (loading) {
    return <EmptyNote>Loading doctor profile…</EmptyNote>;
  }

  if (error || !doctor) {
    return (
      <>
        <PageHeader eyebrow="Doctor profile" title="Doctor not found" description={error || "This doctor is unavailable."} />
        <Link to="/patient/doctors">
          <Button variant="outline">Back to list</Button>
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Doctor profile"
        title={doctor.name}
        description={doctor.about}
        actions={
          <>
            <Link to="/patient/doctors">
              <Button variant="outline">Back to list</Button>
            </Link>
            <Link to="/patient/book" search={{ doctorId: doctor.id }}>
              <Button>Book appointment</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="p-4">
            <div className="flex items-start gap-4">
              <Avatar label={initials(doctor.name)} className="size-14 text-base" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {doctor.speciality}
                  {doctor.subSpecialty ? ` · ${doctor.subSpecialty}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {doctor.clinic}
                  {doctor.location ? ` · ${doctor.location}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="success">{doctor.rating} rating</Badge>
                  <Badge tone="primary">{doctor.experience}</Badge>
                  <Badge>{doctor.reviews} reviews</Badge>
                  <Badge tone="accent">Fee {doctor.fee}</Badge>
                  {doctor.consultationType ? <Badge>{doctor.consultationType}</Badge> : null}
                </div>
              </div>
            </div>
          </Panel>

          {doctor.areasOfExpertise?.length ||
          doctor.qualifications?.length ||
          doctor.certifications?.length ? (
            <Panel className="p-4">
              <SectionLabel>Credentials & expertise</SectionLabel>
              <dl className="mt-3 space-y-2 text-[13px]">
                {doctor.qualifications?.length ? (
                  <div>
                    <dt className="text-muted-foreground">Qualifications</dt>
                    <dd>{doctor.qualifications.join(", ")}</dd>
                  </div>
                ) : null}
                {doctor.certifications?.length ? (
                  <div>
                    <dt className="text-muted-foreground">Certifications</dt>
                    <dd>{doctor.certifications.join(", ")}</dd>
                  </div>
                ) : null}
                {doctor.areasOfExpertise?.length ? (
                  <div>
                    <dt className="text-muted-foreground">Areas of expertise</dt>
                    <dd>{doctor.areasOfExpertise.join(", ")}</dd>
                  </div>
                ) : null}
              </dl>
            </Panel>
          ) : null}

          <Panel className="p-4">
            <SectionLabel>Availability this week</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {dates.map((date) => (
                <button
                  key={date.id}
                  type="button"
                  disabled={date.slots === 0}
                  onClick={() => setSelectedDate(date.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-center transition-colors",
                    selectedDate === date.id ? "border-primary bg-primary/8" : "border-border bg-card hover:border-primary/40",
                    date.slots === 0 && "opacity-40",
                  )}
                >
                  <span className="block text-[13px] font-medium">{date.label}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {date.slots === 0 ? "Full" : `${date.slots} slots`}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {timeSlots.length === 0 ? (
                <p className="col-span-full text-sm text-muted-foreground">No slots on this day.</p>
              ) : (
                timeSlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!slot.available}
                    className={cn(
                      "rounded-md border border-border bg-card py-2 font-mono text-[11px] transition-colors hover:border-primary/40",
                      !slot.available && "opacity-40",
                    )}
                  >
                    {slot.time}
                  </button>
                ))
              )}
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <SectionLabel>At a glance</SectionLabel>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Languages</dt>
                <dd className="text-right">{doctor.languages.join(", ") || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Consultation</dt>
                <dd className="text-right">
                  {doctor.fee}
                  {doctor.consultationType ? ` · ${doctor.consultationType}` : ""}
                </dd>
              </div>
              {doctor.weeklyHoursSummary ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Weekly hours</dt>
                  <dd className="text-right text-xs">{doctor.weeklyHoursSummary}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Next free</dt>
                <dd className="text-primary">{doctor.nextAvailable}</dd>
              </div>
            </dl>
          </Panel>
          <Panel className="p-4">
            <SectionLabel>Not sure this is right?</SectionLabel>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask the receptionist which speciality fits your symptoms.
            </p>
            <Link to="/patient/chat">
              <Button variant="soft" size="sm" className="mt-3 w-full">
                Open chat
              </Button>
            </Link>
          </Panel>
        </aside>
      </div>
    </>
  );
}
