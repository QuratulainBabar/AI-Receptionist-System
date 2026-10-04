import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar, Badge, Button, EmptyNote, Field, PageHeader, Panel, SectionLabel, Textarea } from "@/components/ui/primitives";
import {
  appointmentsApi,
  doctorsApi,
  formatApiError,
  type ApiAvailabilityDate,
  type ApiDoctor,
  type ApiTimeSlot,
} from "@/lib/api";
import { initials } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/patient/book")({
  validateSearch: (search: Record<string, unknown>) => ({
    doctorId: typeof search.doctorId === "string" ? search.doctorId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Book an appointment — AI Receptionist" },
      { name: "description", content: "Choose a doctor, pick an available date and time slot, and confirm your visit." },
      { property: "og:title", content: "Book an appointment — AI Receptionist" },
      { property: "og:description", content: "Available dates and time slots for your chosen doctor." },
    ],
  }),
  component: BookAppointment,
});

function BookAppointment() {
  const navigate = useNavigate();
  const { doctorId } = Route.useSearch();
  const [doctor, setDoctor] = useState<ApiDoctor | null>(null);
  const [dates, setDates] = useState<ApiAvailabilityDate[]>([]);
  const [timeSlots, setTimeSlots] = useState<ApiTimeSlot[]>([]);
  const [dateId, setDateId] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        if (!doctorId) {
          if (!cancelled) {
            setDoctor(null);
            setError("Select a doctor from Find a doctor first.");
          }
          return;
        }

        const [doctorResult, availabilityResult] = await Promise.all([
          doctorsApi.get(doctorId),
          doctorsApi.availability(doctorId),
        ]);
        if (cancelled) return;

        setDoctor(doctorResult.doctor);
        setDates(availabilityResult.availability.dates);
        const initialDate = availabilityResult.availability.selectedDate;
        setDateId(initialDate);
        const firstOpen = availabilityResult.availability.timeSlots.find((slot) => slot.available);
        setSlotId(firstOpen?.id ?? null);
        setTimeSlots(availabilityResult.availability.timeSlots);
      } catch (err) {
        if (!cancelled) setError(formatApiError(err, "Unable to load booking options."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [doctorId]);

  useEffect(() => {
    if (!doctor || !dateId) return;
    let cancelled = false;

    async function loadSlots() {
      try {
        const result = await doctorsApi.availability(doctor!.id, dateId ?? undefined);
        if (cancelled) return;
        setTimeSlots(result.availability.timeSlots);
        setSlotId((current) => {
          const stillOpen = result.availability.timeSlots.find((slot) => slot.id === current && slot.available);
          if (stillOpen) return stillOpen.id;
          return result.availability.timeSlots.find((slot) => slot.available)?.id ?? null;
        });
      } catch (err) {
        if (!cancelled) setError(formatApiError(err, "Unable to load time slots."));
      }
    }

    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [doctor, dateId]);

  const selectedSlot = timeSlots.find((slot) => slot.id === slotId);
  const selectedDate = dates.find((date) => date.id === dateId);

  async function confirmBooking() {
    if (!doctor || !selectedSlot) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await appointmentsApi.create({
        doctorId: doctor.id,
        slotId: selectedSlot.id,
        reason: reason.trim() || undefined,
      });
      await navigate({
        to: "/patient/confirmation",
        search: { appointmentId: result.appointment.id },
      });
    } catch (err) {
      setError(formatApiError(err, "Unable to confirm booking."));
      if (doctor) {
        try {
          const refreshed = await doctorsApi.availability(doctor.id, dateId ?? undefined);
          setDates(refreshed.availability.dates);
          setTimeSlots(refreshed.availability.timeSlots);
          setSlotId(refreshed.availability.timeSlots.find((slot) => slot.available)?.id ?? null);
        } catch {
          // keep existing error message
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <EmptyNote>Loading booking options…</EmptyNote>;
  }

  if (!doctor) {
    return (
      <>
        <PageHeader
          eyebrow="Patient"
          title="Book an appointment"
          description={error || "Select a doctor to continue."}
        />
        <Link to="/patient/doctors">
          <Button>Find a doctor</Button>
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="Book an appointment"
        description="Pick a date and time from this doctor's live availability."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="p-4">
            <SectionLabel>Step 1 · Doctor</SectionLabel>
            <div className="mt-3 flex items-center gap-3">
              <Avatar label={initials(doctor.name)} className="size-11" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{doctor.name}</p>
                <p className="text-xs text-muted-foreground">
                  {doctor.speciality} · {doctor.clinic}
                </p>
              </div>
              <Link to="/patient/doctors">
                <Button variant="outline" size="sm">
                  Change
                </Button>
              </Link>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Step 2 · Date</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {dates.map((date) => (
                <button
                  key={date.id}
                  type="button"
                  disabled={date.slots === 0}
                  onClick={() => setDateId(date.id)}
                  className={cn(
                    "rounded-lg border px-3.5 py-2 text-center transition-colors",
                    dateId === date.id ? "border-primary bg-primary/8" : "border-border bg-card hover:border-primary/40",
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
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Step 3 · Time slot</SectionLabel>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {timeSlots.length === 0 ? (
                <p className="col-span-full text-sm text-muted-foreground">No slots on this day.</p>
              ) : (
                timeSlots.map((slot) => (
                  <button
                    key={slot.id}
                    type="button"
                    disabled={!slot.available}
                    onClick={() => setSlotId(slot.id)}
                    className={cn(
                      "rounded-md border py-2.5 font-mono text-[11px] transition-colors",
                      slotId === slot.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      !slot.available && "opacity-40",
                    )}
                  >
                    {slot.time}
                  </button>
                ))
              )}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Step 4 · Reason for visit</SectionLabel>
            <div className="mt-3">
              <Field label="Tell the doctor what's going on" hint="Optional, but it helps them prepare.">
                <Textarea
                  rows={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Blood pressure follow-up, occasional dizziness in the morning…"
                />
              </Field>
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Summary</SectionLabel>
              <Badge tone="primary">{submitting ? "Booking…" : "Draft"}</Badge>
            </div>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Doctor</dt>
                <dd className="text-right">{doctor.name}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Date</dt>
                <dd>{selectedDate ? `${selectedDate.label} ${selectedDate.month}` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Time</dt>
                <dd>{selectedSlot ? selectedSlot.time : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Fee</dt>
                <dd>{doctor.fee}</dd>
              </div>
            </dl>
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            <Button
              className="mt-4 w-full"
              disabled={!selectedSlot || submitting}
              onClick={() => void confirmBooking()}
            >
              {submitting ? "Confirming…" : "Confirm booking"}
            </Button>
          </Panel>
        </aside>
      </div>
    </>
  );
}
