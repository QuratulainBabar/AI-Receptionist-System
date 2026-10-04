import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DoctorCard } from "@/components/shared/cards";
import { Button, EmptyNote, Input, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { doctorsApi, formatApiError, type ApiDoctor, type ApiSpecialty } from "@/lib/api";

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
  return <DoctorsPage />;
}

function DoctorsPage() {
  const [specialties, setSpecialties] = useState<ApiSpecialty[]>([]);
  const [selectedSpeciality, setSelectedSpeciality] = useState("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [doctors, setDoctors] = useState<ApiDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void doctorsApi
      .listSpecialties()
      .then((result) => {
        setSpecialties(result.specialties);
        setSelectedSpeciality((current) => current || result.specialties[0]?.id || "");
      })
      .catch((err) => setError(formatApiError(err, "Unable to load specialities.")));
  }, []);

  useEffect(() => {
    if (!selectedSpeciality) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await doctorsApi.list({
          specialtyId: selectedSpeciality,
          q: appliedQuery || undefined,
        });
        if (!cancelled) setDoctors(result.doctors);
      } catch (err) {
        if (!cancelled) setError(formatApiError(err, "Unable to load doctors."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedSpeciality, appliedQuery]);

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="Find a doctor"
        description="Filter by speciality, then open a profile to see availability."
      />

      <Panel className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Search doctor, speciality or clinic"
            className="sm:flex-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setAppliedQuery(query.trim());
            }}
          />
          <Button type="button" onClick={() => setAppliedQuery(query.trim())}>
            Search
          </Button>
        </div>
        <div className="mt-3">
          <SectionLabel>Specialities</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {specialties.map((speciality) => (
              <Button
                key={speciality.id}
                type="button"
                variant={selectedSpeciality === speciality.id ? "primary" : "outline"}
                size="sm"
                onClick={() => setSelectedSpeciality(speciality.id)}
              >
                {speciality.name}
              </Button>
            ))}
          </div>
        </div>
      </Panel>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <EmptyNote>Loading doctors…</EmptyNote>
      ) : doctors.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {doctors.map((doctor) => (
            <DoctorCard key={doctor.id} doctor={doctor} />
          ))}
        </div>
      ) : (
        <EmptyNote>No doctors match this speciality and search.</EmptyNote>
      )}
    </>
  );
}
