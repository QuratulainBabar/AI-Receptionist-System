import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button, EmptyNote, Field, Input, PageHeader, Panel, SectionLabel, Textarea } from "@/components/ui/primitives";
import { authApi, formatApiError, medicalHistoryApi, type ApiMedicalHistory } from "@/lib/api";
import { getSession, saveAuth } from "@/lib/session";

export const Route = createFileRoute("/patient/history")({
  head: () => ({
    meta: [
      { title: "Medical history — AI Receptionist" },
      { name: "description", content: "Share conditions, allergies, medication and lifestyle details with your doctor." },
      { property: "og:title", content: "Medical history — AI Receptionist" },
      { property: "og:description", content: "Keep your health background up to date before each visit." },
    ],
  }),
  component: MedicalHistoryPage,
});

type FormState = {
  fullName: string;
  age: string;
  bloodGroup: string;
  phone: string;
  symptoms: string;
  conditions: string;
  allergies: string;
  medications: string;
  surgeries: string;
  familyHistory: string;
};

function historyToForm(history: ApiMedicalHistory): FormState {
  return {
    fullName: history.fullName,
    age: history.age == null ? "" : String(history.age),
    bloodGroup: history.bloodGroup,
    phone: history.phone,
    symptoms: history.symptoms,
    conditions: history.conditions.join("\n"),
    allergies: history.allergies.join("\n"),
    medications: history.medications.join("\n"),
    surgeries: history.surgeries.join("\n"),
    familyHistory: history.familyHistory.join("\n"),
  };
}

function linesToList(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function HistoryListEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Panel className="p-4">
      <SectionLabel>{title}</SectionLabel>
      <Textarea
        className="mt-2.5 min-h-[72px] border-transparent bg-transparent p-0 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="One item per line"
      />
    </Panel>
  );
}

function MedicalHistoryPage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    void medicalHistoryApi
      .get()
      .then((result) => {
        if (!cancelled) setForm(historyToForm(result.history));
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load medical history."));
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

  async function saveHistory() {
    if (!form) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const ageValue = form.age.trim();
      const age = ageValue === "" ? null : Number(ageValue);
      if (ageValue !== "" && (!Number.isInteger(age) || age! < 0 || age! > 130)) {
        setError("Enter a valid age between 0 and 130.");
        return;
      }

      const result = await medicalHistoryApi.save({
        fullName: form.fullName.trim(),
        age,
        bloodGroup: form.bloodGroup,
        phone: form.phone,
        symptoms: form.symptoms,
        conditions: linesToList(form.conditions),
        allergies: linesToList(form.allergies),
        medications: linesToList(form.medications),
        surgeries: linesToList(form.surgeries),
        familyHistory: linesToList(form.familyHistory),
      });

      setForm(historyToForm(result.history));
      setSuccess("Medical history saved.");

      const session = getSession();
      if (session?.token) {
        try {
          const me = await authApi.me(session.token);
          saveAuth(me.user, session.token);
        } catch {
          // history already saved; session refresh is best-effort
        }
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to save medical history."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <EmptyNote>Loading medical history…</EmptyNote>;
  }

  if (!form) {
    return <PageHeader eyebrow="Patient" title="Medical history" description={error || "Unable to load history."} />;
  }

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="Medical history"
        description="What your doctor sees before the visit. Changes are saved to your patient record."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="p-4">
            <SectionLabel>Basics</SectionLabel>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Full name">
                <Input value={form.fullName} onChange={(e) => updateField("fullName", e.target.value)} />
              </Field>
              <Field label="Age">
                <Input
                  type="number"
                  min={0}
                  max={130}
                  value={form.age}
                  onChange={(e) => updateField("age", e.target.value)}
                />
              </Field>
              <Field label="Blood group">
                <Input value={form.bloodGroup} onChange={(e) => updateField("bloodGroup", e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
              </Field>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Current symptoms or concerns</SectionLabel>
            <div className="mt-3">
              <Field label="Describe what's bothering you">
                <Textarea
                  rows={4}
                  value={form.symptoms}
                  onChange={(e) => updateField("symptoms", e.target.value)}
                  placeholder="Occasional dizziness in the morning, mild headaches after work…"
                />
              </Field>
            </div>
            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            {success ? <p className="mt-3 text-sm text-primary">{success}</p> : null}
            <Button className="mt-3" disabled={saving} onClick={() => void saveHistory()}>
              {saving ? "Saving…" : "Save history"}
            </Button>
          </Panel>
        </div>

        <aside className="space-y-4">
          <HistoryListEditor
            title="Conditions"
            value={form.conditions}
            onChange={(value) => updateField("conditions", value)}
          />
          <HistoryListEditor
            title="Allergies"
            value={form.allergies}
            onChange={(value) => updateField("allergies", value)}
          />
          <HistoryListEditor
            title="Medication"
            value={form.medications}
            onChange={(value) => updateField("medications", value)}
          />
          <HistoryListEditor
            title="Surgeries"
            value={form.surgeries}
            onChange={(value) => updateField("surgeries", value)}
          />
          <HistoryListEditor
            title="Family history"
            value={form.familyHistory}
            onChange={(value) => updateField("familyHistory", value)}
          />
        </aside>
      </div>
    </>
  );
}
