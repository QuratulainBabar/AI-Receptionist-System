import { createFileRoute } from "@tanstack/react-router";
import { Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { medicalRecords } from "@/lib/mock-data";

export const Route = createFileRoute("/patient/records")({
  head: () => ({
    meta: [
      { title: "Reports & records — AI Receptionist" },
      { name: "description", content: "Upload lab results, scans and prescriptions so your doctor can review them." },
      { property: "og:title", content: "Reports & records — AI Receptionist" },
      { property: "og:description", content: "Your medical reports in one place, ready for your next visit." },
    ],
  }),
  component: RecordsPage,
});

function RecordsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="Reports & records"
        description="Upload area is UI only in this preview — no file is stored."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionLabel className="mb-3">Uploaded documents</SectionLabel>
          <div className="space-y-2">
            {medicalRecords.map((record) => (
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
                <Button variant="outline" size="sm">
                  View
                </Button>
              </Panel>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <SectionLabel>Upload a report</SectionLabel>
            <div className="mt-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-6 text-center">
              <p className="text-[13px] font-medium">Drop a file here</p>
              <p className="mt-1 text-xs text-muted-foreground">PDF, JPG or PNG up to 10 MB</p>
              <Button variant="outline" size="sm" className="mt-3">
                Choose file
              </Button>
            </div>
            <EmptyNote>Uploads are disabled in this preview.</EmptyNote>
          </Panel>
        </aside>
      </div>
    </>
  );
}
