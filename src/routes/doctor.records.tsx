import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { InfoList } from "@/components/shared/cards";
import { Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import {
  doctorPatientsApi,
  formatApiError,
  type ApiDoctorPatient,
  type ApiDoctorPatientFile,
} from "@/lib/api";

export const Route = createFileRoute("/doctor/records")({
  validateSearch: (search: Record<string, unknown>) => ({
    patientId: typeof search.patientId === "string" ? search.patientId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "History & reports — AI Receptionist" },
      { name: "description", content: "Review patient medical history and uploaded reports before visits." },
      { property: "og:title", content: "History & reports — AI Receptionist" },
      { property: "og:description", content: "Conditions, allergies, medications and lab uploads in one place." },
    ],
  }),
  component: DoctorRecords,
});

function DoctorRecords() {
  const { patientId: searchPatientId } = Route.useSearch();
  const navigate = Route.useNavigate();

  const [patients, setPatients] = useState<ApiDoctorPatient[]>([]);
  const [file, setFile] = useState<ApiDoctorPatientFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  const selectedPatientId = useMemo(() => {
    if (searchPatientId && patients.some((patient) => patient.id === searchPatientId)) {
      return searchPatientId;
    }
    return patients[0]?.id;
  }, [patients, searchPatientId]);

  useEffect(() => {
    let cancelled = false;
    void doctorPatientsApi
      .list()
      .then((result) => {
        if (!cancelled) setPatients(result.patients);
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load patients."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedPatientId) {
      setFile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");
    void doctorPatientsApi
      .get(selectedPatientId)
      .then((result) => {
        if (!cancelled) {
          setFile({
            patient: result.patient,
            appointments: result.appointments,
            history: result.history,
            records: result.records,
          });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFile(null);
          setError(formatApiError(err, "Unable to load patient history."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedPatientId]);

  function selectPatient(patientId: string) {
    void navigate({
      search: (prev) => ({ ...prev, patientId }),
    });
  }

  async function viewRecord(recordId: string) {
    if (!selectedPatientId) return;
    setOpeningId(recordId);
    setError("");
    try {
      await doctorPatientsApi.openRecordFile(selectedPatientId, recordId);
    } catch (err) {
      setError(formatApiError(err, "Unable to open this file."));
    } finally {
      setOpeningId(null);
    }
  }

  const otherPatients = patients.filter((patient) => patient.id !== selectedPatientId);
  const patient = file?.patient;
  const history = file?.history;
  const records = file?.records ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Doctor"
        title="History & reports"
        description={
          patient
            ? `Showing file for ${patient.name}. Open any patient for their visits.`
            : "Open a patient to review history and uploaded reports."
        }
        actions={
          patient ? (
            <Link to="/doctor/patients/$patientId" params={{ patientId: patient.id }}>
              <Button>Open patient file</Button>
            </Link>
          ) : (
            <Link to="/doctor/patients">
              <Button variant="outline">Patient list</Button>
            </Link>
          )
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <EmptyNote>Loading history & reports…</EmptyNote>
      ) : !patient || !history ? (
        <EmptyNote>
          No patients assigned yet. Patients appear here after they book with you.{" "}
          <Link to="/doctor/patients" className="font-medium text-primary underline-offset-2 hover:underline">
            Go to patient list
          </Link>
          .
        </EmptyNote>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Panel className="p-4">
              <SectionLabel>Patient overview</SectionLabel>
              <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
                <div className="flex justify-between gap-2 border-b border-border pb-2">
                  <span className="text-muted-foreground">Name</span>
                  <span className="font-medium">{patient.name}</span>
                </div>
                <div className="flex justify-between gap-2 border-b border-border pb-2">
                  <span className="text-muted-foreground">Reference</span>
                  <span className="font-mono text-[11px]">{patient.reference}</span>
                </div>
                <div className="flex justify-between gap-2 border-b border-border pb-2">
                  <span className="text-muted-foreground">Age</span>
                  <span>{patient.age ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-2 border-b border-border pb-2">
                  <span className="text-muted-foreground">Blood group</span>
                  <span>{history.bloodGroup || "—"}</span>
                </div>
              </div>
            </Panel>

            <section>
              <SectionLabel className="mb-3">Uploaded documents</SectionLabel>
              {records.length === 0 ? (
                <EmptyNote>No uploaded documents for this patient yet.</EmptyNote>
              ) : (
                <div className="space-y-2">
                  {records.map((record) => (
                    <Panel key={record.id} className="flex items-center gap-3 p-3.5">
                      <div className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary font-mono text-[10px] uppercase text-secondary-foreground">
                        {record.name.split(".").pop()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{record.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {record.date} · {record.size} · {record.uploadedBy}
                        </p>
                      </div>
                      <Badge tone="primary">{record.type}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={openingId === record.id}
                        onClick={() => void viewRecord(record.id)}
                      >
                        {openingId === record.id ? "Opening…" : "View"}
                      </Button>
                    </Panel>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            {history.conditions.length ? <InfoList title="Conditions" items={history.conditions} /> : null}
            {history.allergies.length ? <InfoList title="Allergies" items={history.allergies} /> : null}
            {history.medications.length ? <InfoList title="Medication" items={history.medications} /> : null}
            {history.surgeries.length ? <InfoList title="Surgeries" items={history.surgeries} /> : null}
            {history.familyHistory.length ? (
              <InfoList title="Family history" items={history.familyHistory} />
            ) : null}

            {!history.conditions.length &&
            !history.allergies.length &&
            !history.medications.length &&
            !history.surgeries.length &&
            !history.familyHistory.length ? (
              <Panel className="p-4">
                <SectionLabel>Medical history</SectionLabel>
                <p className="mt-2 text-sm text-muted-foreground">
                  This patient has not submitted a detailed medical history yet.
                </p>
              </Panel>
            ) : null}

            <Panel className="p-4">
              <SectionLabel>Other patients</SectionLabel>
              {otherPatients.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No other patients in your list yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {otherPatients.map((other) => (
                    <li key={other.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px]">{other.name}</span>
                      <Button variant="ghost" size="sm" onClick={() => selectPatient(other.id)}>
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </aside>
        </div>
      )}
    </>
  );
}
