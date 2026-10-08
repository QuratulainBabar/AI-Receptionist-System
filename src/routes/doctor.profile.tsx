import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Button,
  EmptyNote,
  Field,
  Input,
  PageHeader,
  Panel,
  SectionLabel,
} from "@/components/ui/primitives";
import {
  doctorProfileApi,
  formatApiError,
  type ApiDoctorProfile,
} from "@/lib/api";

export const Route = createFileRoute("/doctor/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Doctor portal" },
      {
        name: "description",
        content: "Update your specialty, hospital, and fees for the phone AI receptionist.",
      },
    ],
  }),
  component: DoctorProfilePage,
});

type FormState = {
  specialty: string;
  experienceYears: string;
  clinic: string;
  fee: string;
};

function profileToForm(profile: ApiDoctorProfile): FormState {
  const incomplete = !profile.clinic?.trim() && !profile.fee?.trim();

  return {
    specialty: profile.specialty?.trim() || "",
    experienceYears:
      incomplete && !profile.experienceYears ? "" : String(profile.experienceYears ?? 0),
    clinic: profile.clinic || "",
    fee: profile.fee || "",
  };
}

function DoctorProfilePage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [meta, setMeta] = useState<{ fullName: string; email: string; reference: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    void doctorProfileApi
      .get()
      .then((profileResult) => {
        if (cancelled) return;
        setForm(profileToForm(profileResult.profile));
        setMeta({
          fullName: profileResult.profile.fullName,
          email: profileResult.profile.email,
          reference: profileResult.profile.reference,
        });
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load doctor profile."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSuccess("");
  }

  async function saveProfile() {
    if (!form) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const years =
        form.experienceYears.trim() === "" ? Number.NaN : Number(form.experienceYears);
      if (!Number.isFinite(years) || years < 0 || years > 80) {
        setError("Enter years of experience between 0 and 80.");
        return;
      }
      if (!form.specialty.trim()) {
        setError("Enter your specialty.");
        return;
      }
      if (!form.clinic.trim() || !form.fee.trim()) {
        setError("Hospital name and consultation fee are required.");
        return;
      }

      const result = await doctorProfileApi.update({
        specialty: form.specialty.trim(),
        experienceYears: Math.floor(years),
        clinic: form.clinic.trim(),
        fee: form.fee.trim(),
        consultationType: "In clinic",
      });

      setForm(profileToForm(result.profile));
      setSuccess(
        "Profile saved. Super Admin Synthflow sync will push these details to the phone AI as the clinic’s only doctor.",
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to save doctor profile."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="My professional profile"
        description="This is the clinic’s doctor profile for the phone AI. After you save and Super Admin runs Sync, the receptionist uses only your latest details."
        actions={
          <Button onClick={() => void saveProfile()} disabled={!form || saving || loading}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-success">{success}</p> : null}

      {loading || !form ? (
        <EmptyNote>{loading ? "Loading profile…" : "Profile unavailable."}</EmptyNote>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Panel className="space-y-4 p-4">
            <SectionLabel>Practice details</SectionLabel>
            {meta ? (
              <p className="text-sm text-muted-foreground">
                {meta.fullName} · {meta.email} · {meta.reference}
              </p>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Specialty" hint="Your actual specialty (for example Cardiologist).">
                <Input
                  value={form.specialty}
                  onChange={(e) => updateField("specialty", e.target.value)}
                  placeholder="Enter your specialty"
                />
              </Field>
              <Field label="Years of experience">
                <Input
                  type="number"
                  min={0}
                  max={80}
                  value={form.experienceYears}
                  onChange={(e) => updateField("experienceYears", e.target.value)}
                  placeholder="Enter years of experience"
                />
              </Field>
              <Field label="Hospital name">
                <Input
                  value={form.clinic}
                  onChange={(e) => updateField("clinic", e.target.value)}
                  placeholder="Enter hospital name"
                />
              </Field>
              <Field label="Consultation fee">
                <Input
                  value={form.fee}
                  onChange={(e) => updateField("fee", e.target.value)}
                  placeholder="Enter consultation fee"
                />
              </Field>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Phone AI note</SectionLabel>
            <p className="mt-2 text-sm text-muted-foreground">
              After Super Admin runs Synthflow sync, the receptionist introduces only you, quotes
              your specialty and fee, and offers your real open slots. Set weekly hours and
              bookable slots on Availability.
            </p>
          </Panel>
        </div>
      )}
    </>
  );
}
