import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FollowUpDialog } from "@/components/doctor/FollowUpDialog";
import { AppointmentCard, InfoList } from "@/components/shared/cards";
import {
  Avatar,
  Badge,
  Button,
  EmptyNote,
  PageHeader,
  Panel,
  SectionLabel,
} from "@/components/ui/primitives";
import {
  doctorAppointmentsApi,
  doctorPatientsApi,
  formatApiError,
  type ApiAppointment,
  type ApiDoctorPatientFile,
} from "@/lib/api";
import { initials } from "@/lib/mock-data";

export const Route = createFileRoute("/doctor/patients/$patientId")({
  head: () => ({
    meta: [
      { title: "Patient file — AI Receptionist" },
      { name: "description", content: "Review patient history, reports and visits." },
    ],
  }),
  component: PatientDetails,
});

function PatientDetails() {
  const { patientId } = Route.useParams();
  const [file, setFile] = useState<ApiDoctorPatientFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [followUpFor, setFollowUpFor] = useState<ApiAppointment | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void doctorPatientsApi
      .get(patientId)
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
        if (!cancelled) setError(formatApiError(err, "Unable to load patient file."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (loading) {
    return <EmptyNote>Loading patient file…</EmptyNote>;
  }

  if (error || !file) {
    return (
      <>
        <PageHeader eyebrow="Patient file" title="Patient not found" />
        <p className="mb-4 text-sm text-destructive">{error || "Patient not found in your list."}</p>
        <Link to="/doctor/patients">
          <Button variant="outline">Back to list</Button>
        </Link>
      </>
    );
  }

  const { patient, appointments, history, records } = file;
  const ageLabel = patient.age != null ? `${patient.age} years` : "Age unknown";

  async function changeStatus(appointment: ApiAppointment, status: ApiAppointment["status"]) {
    setBusyId(appointment.id);
    setError("");
    try {
      const result = await doctorAppointmentsApi.updateStatus(appointment.id, status);
      setFile((current) =>
        current
          ? {
              ...current,
              appointments: current.appointments.map((row) =>
                row.id === appointment.id ? result.appointment : row,
              ),
            }
          : current,
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to update appointment status."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Patient file"
        title={patient.name}
        description={`${patient.condition} · Reference ${patient.reference}`}
        actions={
          <>
            <Link to="/doctor/patients">
              <Button variant="outline">Back to list</Button>
            </Link>
            <Link to="/doctor/records" search={{ patientId: patient.id }}>
              <Button>History & reports</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="p-4">
            <div className="flex items-start gap-4">
              <Avatar label={initials(patient.name)} className="size-14 text-base" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {ageLabel} · {patient.gender}
                </p>
                <p className="text-xs text-muted-foreground">{patient.phone || "No phone on file"}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="primary">{patient.condition}</Badge>
                  <Badge>{patient.reference}</Badge>
                  <Badge tone="muted">Last visit {patient.lastVisit}</Badge>
                  <Badge tone={patient.isActive ? "success" : "muted"}>
                    {patient.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            </div>
          </Panel>

          <section className="space-y-3">
            <SectionLabel>Appointments</SectionLabel>
            {appointments.length > 0 ? (
              appointments.map((appointment) => (
                <div key={appointment.id} className="space-y-2">
                  <AppointmentCard appointment={appointment} perspective="doctor" />
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {appointment.status !== "completed" && appointment.status !== "cancelled" ? (
                      <>
                        {appointment.status !== "confirmed" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === appointment.id}
                            onClick={() => void changeStatus(appointment, "confirmed")}
                          >
                            Confirm
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === appointment.id}
                          onClick={() => void changeStatus(appointment, "completed")}
                        >
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busyId === appointment.id}
                          onClick={() => void changeStatus(appointment, "cancelled")}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : null}
                    {appointment.status !== "cancelled" ? (
                      <Button size="sm" variant="soft" onClick={() => setFollowUpFor(appointment)}>
                        Schedule follow-up
                      </Button>
                    ) : null}
                    {appointment.isFollowUp ? (
                      <Badge tone="primary">
                        Follow-up of {appointment.followUpOfReference || "prior visit"}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <Panel className="p-4">
                <p className="text-sm text-muted-foreground">No appointments on record for this patient yet.</p>
              </Panel>
            )}
          </section>

          {records.length > 0 ? (
            <section className="space-y-3">
              <SectionLabel>Uploaded reports</SectionLabel>
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
                    onClick={() => void doctorPatientsApi.openRecordFile(patient.id, record.id)}
                  >
                    View
                  </Button>
                </Panel>
              ))}
            </section>
          ) : null}
        </div>

        <aside className="space-y-4">
          {history.conditions.length ||
          history.allergies.length ||
          history.medications.length ||
          history.familyHistory.length ? (
            <>
              {history.conditions.length ? <InfoList title="Conditions" items={history.conditions} /> : null}
              {history.allergies.length ? <InfoList title="Allergies" items={history.allergies} /> : null}
              {history.medications.length ? <InfoList title="Medication" items={history.medications} /> : null}
              {history.familyHistory.length ? (
                <InfoList title="Family history" items={history.familyHistory} />
              ) : null}
            </>
          ) : (
            <Panel className="p-4">
              <SectionLabel>Medical history</SectionLabel>
              <p className="mt-2 text-sm text-muted-foreground">
                This patient has not submitted a detailed medical history yet.
              </p>
            </Panel>
          )}
        </aside>
      </div>

      {followUpFor ? (
        <FollowUpDialog
          parent={followUpFor}
          onClose={() => setFollowUpFor(null)}
          onCreated={(appointment) => {
            setFile((current) =>
              current
                ? { ...current, appointments: [appointment, ...current.appointments] }
                : current,
            );
            setFollowUpFor(null);
          }}
        />
      ) : null}
    </>
  );
}
