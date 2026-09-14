import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Avatar, Badge, Button, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { availableDates, doctors, initials, timeSlots } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/patient/doctors/$doctorId")({
  loader: ({ params }) => {
    const doctor = doctors.find((d) => d.id === params.doctorId);
    if (!doctor) throw notFound();
    return { doctor };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Doctor not found — AI Receptionist" }, { name: "robots", content: "noindex" }] };
    }
    const { doctor } = loaderData;
    const description = `${doctor.speciality} at ${doctor.clinic}. ${doctor.experience} of experience. Next available ${doctor.nextAvailable}.`;
    return {
      meta: [
        { title: `${doctor.name} — AI Receptionist` },
        { name: "description", content: description },
        { property: "og:title", content: `${doctor.name} · ${doctor.speciality}` },
        { property: "og:description", content: description },
      ],
    };
  },
  component: DoctorDetails,
});

function DoctorDetails() {
  const { doctor } = Route.useLoaderData();

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
                <p className="text-sm font-semibold">{doctor.speciality}</p>
                <p className="text-xs text-muted-foreground">{doctor.clinic}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="success">{doctor.rating} rating</Badge>
                  <Badge tone="primary">{doctor.experience}</Badge>
                  <Badge>{doctor.reviews} reviews</Badge>
                  <Badge tone="accent">Fee {doctor.fee}</Badge>
                </div>
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Availability this week</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-2">
              {availableDates.map((date, index) => (
                <button
                  key={date.id}
                  type="button"
                  disabled={date.slots === 0}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-center transition-colors",
                    index === 0 ? "border-primary bg-primary/8" : "border-border bg-card hover:border-primary/40",
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
              {timeSlots.map((slot) => (
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
              ))}
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <SectionLabel>At a glance</SectionLabel>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Languages</dt>
                <dd className="text-right">{doctor.languages.join(", ")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Consultation</dt>
                <dd>{doctor.fee}</dd>
              </div>
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
