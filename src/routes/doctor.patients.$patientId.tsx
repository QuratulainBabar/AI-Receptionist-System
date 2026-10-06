import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FollowUpDialog } from "@/components/doctor/FollowUpDialog";
import { AppointmentInvoiceAction } from "@/components/doctor/AppointmentInvoiceAction";
import { PatientTimeline } from "@/components/doctor/PatientTimeline";
import { InfoList } from "@/components/shared/cards";
import {
  Avatar,
  Badge,
  Button,
  EmptyNote,
  Field,
  Input,
  PageHeader,
  Panel,
  SectionLabel,
  Textarea,
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
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [followUpFor, setFollowUpFor] = useState<ApiAppointment | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteAppointmentId, setNoteAppointmentId] = useState("");
  const [rxMedication, setRxMedication] = useState("");
  const [rxDosage, setRxDosage] = useState("");
  const [rxInstructions, setRxInstructions] = useState("");
  const [rxAppointmentId, setRxAppointmentId] = useState("");
  const [savingChart, setSavingChart] = useState<"note" | "prescription" | null>(null);

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
            recordGroups: result.recordGroups ?? [],
            timeline: result.timeline ?? [],
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

  const { patient, appointments, history } = file;
  const ageLabel = patient.age != null ? `${patient.age} years` : "Age unknown";

  async function changeStatus(appointment: ApiAppointment, status: ApiAppointment["status"]) {
    setBusyId(appointment.id);
    setError("");
    setMessage("");
    try {
      await doctorAppointmentsApi.updateStatus(appointment.id, status);
      const refreshed = await doctorPatientsApi.get(patientId);
      setFile({
        patient: refreshed.patient,
        appointments: refreshed.appointments,
        history: refreshed.history,
        records: refreshed.records,
        recordGroups: refreshed.recordGroups ?? [],
        timeline: refreshed.timeline ?? [],
      });
      if (status === "completed") {
        setFollowUpFor(refreshed.appointments.find((row) => row.id === appointment.id) ?? appointment);
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to update appointment status."));
    } finally {
      setBusyId(null);
    }
  }

  async function requestRecords(appointment: ApiAppointment) {
    setRequestingId(appointment.id);
    setError("");
    setMessage("");
    try {
      const result = await doctorAppointmentsApi.requestRecords(appointment.id);
      setFile((current) =>
        current
          ? {
              ...current,
              appointments: current.appointments.map((row) =>
                row.id === appointment.id
                  ? {
                      ...row,
                      recordRequest: {
                        status: result.request.status,
                        smsSent: result.request.smsSent,
                        smsError: result.request.smsError,
                        expiresAt: result.request.expiresAt,
                        createdAt: result.request.createdAt,
                        recordsCount: result.request.recordsCount,
                      },
                    }
                  : row,
              ),
            }
          : current,
      );
      const base = result.message || result.request.message || "Upload link sent to the patient.";
      setMessage(
        result.request.smsSent || !result.request.uploadUrl
          ? base
          : `${base} Link: ${result.request.uploadUrl}`,
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to request medical records."));
    } finally {
      setRequestingId(null);
    }
  }

  function applyFile(result: ApiDoctorPatientFile & { message?: string }) {
    setFile({
      patient: result.patient,
      appointments: result.appointments,
      history: result.history,
      records: result.records,
      recordGroups: result.recordGroups ?? [],
      timeline: result.timeline ?? [],
    });
  }

  async function saveNote() {
    setSavingChart("note");
    setError("");
    setMessage("");
    try {
      const result = await doctorPatientsApi.addNote(patientId, {
        body: noteBody.trim(),
        appointmentId: noteAppointmentId || undefined,
      });
      applyFile(result);
      setNoteBody("");
      setMessage(result.message || "Note saved on the patient timeline.");
    } catch (err) {
      setError(formatApiError(err, "Unable to save the note."));
    } finally {
      setSavingChart(null);
    }
  }

  async function savePrescription() {
    setSavingChart("prescription");
    setError("");
    setMessage("");
    try {
      const result = await doctorPatientsApi.addPrescription(patientId, {
        medication: rxMedication.trim(),
        dosage: rxDosage.trim() || undefined,
        instructions: rxInstructions.trim() || undefined,
        appointmentId: rxAppointmentId || undefined,
      });
      applyFile(result);
      setRxMedication("");
      setRxDosage("");
      setRxInstructions("");
      setMessage(result.message || "Prescription saved on the patient timeline.");
    } catch (err) {
      setError(formatApiError(err, "Unable to save the prescription."));
    } finally {
      setSavingChart(null);
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

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {message ? <p className="mb-4 text-sm text-primary">{message}</p> : null}

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

          <section className="grid gap-4 md:grid-cols-2">
            <Panel className="space-y-3 p-4">
              <SectionLabel>Doctor note</SectionLabel>
              <Field label="Appointment">
                <select
                  className="h-11 w-full rounded-xl border border-transparent bg-input-fill px-3.5 text-sm"
                  value={noteAppointmentId}
                  onChange={(e) => setNoteAppointmentId(e.target.value)}
                >
                  <option value="">Not linked to a visit</option>
                  {appointments.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {appointment.reference} · {appointment.date}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Note">
                <Textarea rows={4} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Visit findings, plan, or follow-up instructions" />
              </Field>
              <Button
                size="sm"
                disabled={savingChart === "note" || !noteBody.trim()}
                onClick={() => void saveNote()}
              >
                {savingChart === "note" ? "Saving…" : "Save note"}
              </Button>
            </Panel>
            <Panel className="space-y-3 p-4">
              <SectionLabel>Prescription</SectionLabel>
              <Field label="Appointment">
                <select
                  className="h-11 w-full rounded-xl border border-transparent bg-input-fill px-3.5 text-sm"
                  value={rxAppointmentId}
                  onChange={(e) => setRxAppointmentId(e.target.value)}
                >
                  <option value="">Not linked to a visit</option>
                  {appointments.map((appointment) => (
                    <option key={appointment.id} value={appointment.id}>
                      {appointment.reference} · {appointment.date}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Medication">
                <Input value={rxMedication} onChange={(e) => setRxMedication(e.target.value)} placeholder="Medication name" />
              </Field>
              <Field label="Dosage">
                <Input value={rxDosage} onChange={(e) => setRxDosage(e.target.value)} placeholder="Dose and frequency" />
              </Field>
              <Field label="Instructions">
                <Textarea rows={3} value={rxInstructions} onChange={(e) => setRxInstructions(e.target.value)} placeholder="How the patient should take it" />
              </Field>
              <Button
                size="sm"
                disabled={savingChart === "prescription" || !rxMedication.trim()}
                onClick={() => void savePrescription()}
              >
                {savingChart === "prescription" ? "Saving…" : "Save prescription"}
              </Button>
            </Panel>
          </section>

          <section className="space-y-3">
            <SectionLabel>Medical timeline</SectionLabel>
            <PatientTimeline
              events={file.timeline ?? []}
              appointments={appointments}
              onViewRecord={(recordId) => void doctorPatientsApi.openRecordFile(patient.id, recordId)}
              renderVisitActions={(appointment) => (
                <div className="flex flex-wrap gap-1.5">
                  {appointment.status !== "completed" && appointment.status !== "cancelled" ? (
                    <>
                      {appointment.status !== "confirmed" ? (
                        <Button size="sm" variant="outline" disabled={busyId === appointment.id} onClick={() => void changeStatus(appointment, "confirmed")}>
                          Confirm
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" disabled={busyId === appointment.id} onClick={() => void changeStatus(appointment, "completed")}>
                        Complete
                      </Button>
                      <Button size="sm" variant="danger" disabled={busyId === appointment.id} onClick={() => void changeStatus(appointment, "cancelled")}>
                        Cancel
                      </Button>
                    </>
                  ) : null}
                  {appointment.status !== "cancelled" ? (
                    <>
                      <Button size="sm" variant="soft" disabled={requestingId === appointment.id} onClick={() => void requestRecords(appointment)}>
                        {requestingId === appointment.id ? "Sending…" : appointment.recordRequest ? "Resend records request" : "Request medical records"}
                      </Button>
                      <Button size="sm" variant="soft" onClick={() => setFollowUpFor(appointment)}>
                        Schedule next visit
                      </Button>
                    </>
                  ) : null}
                  <AppointmentInvoiceAction
                    appointment={appointment}
                    onUpdated={(updated, note) => {
                      setFile((current) =>
                        current
                          ? {
                              ...current,
                              appointments: current.appointments.map((row) => (row.id === updated.id ? updated : row)),
                            }
                          : current,
                      );
                      setMessage(note);
                      setError("");
                    }}
                  />
                </div>
              )}
            />
          </section>


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
          onCreated={(_appointment, note) => {
            void doctorPatientsApi.get(patientId).then((refreshed) => {
              applyFile(refreshed);
              setMessage(note);
              setFollowUpFor(null);
            });
          }}
        />
      ) : null}
    </>
  );
}
