import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { DoctorCard } from "@/components/shared/cards";
import { Button, Input, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { doctors, specialities } from "@/lib/mock-data";

export const Route = createFileRoute("/patient/doctors")({
  head: () => ({
    meta: [
      { title: "Find a doctor — AI Receptionist" },
      { name: "description", content: "Browse specialities and doctors, and check who is available this week." },
      { property: "og:title", content: "Find a doctor — AI Receptionist" },
      { property: "og:description", content: "Search by speciality and see the next available slot for each doctor." },
    ],
  }),
  component: DoctorsLayout,
});

function DoctorsLayout() {
  const matches = useMatches();
  const isDetail = matches.some((match) => match.routeId === "/patient/doctors/$doctorId");
  if (isDetail) return <Outlet />;

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="Find a doctor"
        description="Filter by speciality, then open a profile to see availability."
      />

      <Panel className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input placeholder="Search doctor, speciality or clinic" className="sm:flex-1" />
          <Button>Search</Button>
        </div>
        <div className="mt-3">
          <SectionLabel>Specialities</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {specialities.map((speciality, index) => (
              <Button key={speciality.id} variant={index === 0 ? "primary" : "outline"} size="sm">
                {speciality.name}
              </Button>
            ))}
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {doctors.map((doctor) => (
          <DoctorCard key={doctor.id} doctor={doctor} />
        ))}
      </div>
    </>
  );
}
