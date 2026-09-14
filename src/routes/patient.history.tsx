import { createFileRoute } from "@tanstack/react-router";
import { InfoList } from "@/components/shared/cards";
import { Button, Field, Input, PageHeader, Panel, SectionLabel, Textarea } from "@/components/ui/primitives";
import { currentPatient, medicalHistory } from "@/lib/mock-data";

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

function MedicalHistoryPage() {
  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="Medical history"
        description="What your doctor sees before the visit. Changes here are not saved in this preview."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="p-4">
            <SectionLabel>Basics</SectionLabel>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Full name">
                <Input defaultValue={currentPatient.name} />
              </Field>
              <Field label="Age">
                <Input defaultValue={String(currentPatient.age)} />
              </Field>
              <Field label="Blood group">
                <Input defaultValue={currentPatient.bloodGroup} />
              </Field>
              <Field label="Phone">
                <Input defaultValue={currentPatient.phone} />
              </Field>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Current symptoms or concerns</SectionLabel>
            <div className="mt-3">
              <Field label="Describe what's bothering you">
                <Textarea rows={4} placeholder="Occasional dizziness in the morning, mild headaches after work…" />
              </Field>
            </div>
            <Button className="mt-3">Save history</Button>
          </Panel>
        </div>

        <aside className="space-y-4">
          <InfoList title="Conditions" items={medicalHistory.conditions} />
          <InfoList title="Allergies" items={medicalHistory.allergies} />
          <InfoList title="Medication" items={medicalHistory.medications} />
          <InfoList title="Surgeries" items={medicalHistory.surgeries} />
          <InfoList title="Family history" items={medicalHistory.familyHistory} />
        </aside>
      </div>
    </>
  );
}
