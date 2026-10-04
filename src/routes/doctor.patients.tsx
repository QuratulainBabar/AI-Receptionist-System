import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  EmptyNote,
  Input,
  PageHeader,
  Panel,
  SectionLabel,
} from "@/components/ui/primitives";
import { doctorPatientsApi, formatApiError, type ApiDoctorPatient } from "@/lib/api";
import { initials } from "@/lib/mock-data";

export const Route = createFileRoute("/doctor/patients")({
  head: () => ({
    meta: [
      { title: "Patient list — AI Receptionist" },
      { name: "description", content: "Browse patients assigned to your clinic and open their files." },
      { property: "og:title", content: "Patient list — AI Receptionist" },
      { property: "og:description", content: "Search patients and review recent conditions." },
    ],
  }),
  component: PatientsLayout,
});

function PatientsLayout() {
  const matches = useMatches();
  const isDetail = matches.some((match) => match.routeId === "/doctor/patients/$patientId");
  if (isDetail) return <Outlet />;
  return <PatientListPage />;
}

function PatientListPage() {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [patients, setPatients] = useState<ApiDoctorPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void doctorPatientsApi
      .list({ q: appliedQuery || undefined })
      .then((result) => {
        if (!cancelled) setPatients(result.patients);
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load patients."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedQuery]);

  return (
    <>
      <PageHeader
        eyebrow="Doctor"
        title="Patient list"
        description="Open a file to review history, reports and visits."
      />

      <Panel className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Search by name, reference or condition"
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
      </Panel>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <SectionLabel className="mb-3">Your patients</SectionLabel>
      {loading ? (
        <EmptyNote>Loading patients…</EmptyNote>
      ) : patients.length === 0 ? (
        <EmptyNote>
          {appliedQuery
            ? "No patients match that search."
            : "No patients assigned yet. Patients appear here after they book with you."}
        </EmptyNote>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {patients.map((patient) => (
            <Panel key={patient.id} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar label={initials(patient.name)} className="size-11" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{patient.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[patient.age ?? "—", patient.gender, patient.condition].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{patient.reference}</p>
                </div>
                <Badge tone={patient.isActive ? "primary" : "muted"}>
                  {patient.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                <span className="font-mono text-[11px] text-muted-foreground">
                  Last visit: {patient.lastVisit}
                </span>
                <Link to="/doctor/patients/$patientId" params={{ patientId: patient.id }}>
                  <Button variant="outline" size="sm">
                    Open file
                  </Button>
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
