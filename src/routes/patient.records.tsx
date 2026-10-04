import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { formatApiError, recordsApi, type ApiMedicalRecord } from "@/lib/api";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [records, setRecords] = useState<ApiMedicalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragOver, setDragOver] = useState(false);

  async function loadRecords() {
    setLoading(true);
    setError("");
    try {
      const result = await recordsApi.list();
      setRecords(result.records);
    } catch (err) {
      setError(formatApiError(err, "Unable to load records."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  async function uploadFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError("");
    setSuccess("");
    try {
      const result = await recordsApi.upload(file);
      setRecords((current) => [result.record, ...current]);
      setSuccess(`${result.record.name} uploaded.`);
    } catch (err) {
      setError(formatApiError(err, "Unable to upload file."));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function viewRecord(recordId: string) {
    setOpeningId(recordId);
    setError("");
    try {
      await recordsApi.openFile(recordId);
    } catch (err) {
      setError(formatApiError(err, "Unable to open this file."));
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="Reports & records"
        description="Upload lab results, scans and prescriptions for your next visit."
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-primary">{success}</p> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionLabel className="mb-3">Uploaded documents</SectionLabel>
          {loading ? (
            <EmptyNote>Loading records…</EmptyNote>
          ) : records.length === 0 ? (
            <EmptyNote>No documents yet. Upload a PDF, JPG or PNG to get started.</EmptyNote>
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
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <SectionLabel>Upload a report</SectionLabel>
            <div
              className={`mt-3 rounded-lg border border-dashed p-6 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/10" : "border-primary/40 bg-primary/5"
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                void uploadFile(event.dataTransfer.files?.[0]);
              }}
            >
              <p className="text-[13px] font-medium">Drop a file here</p>
              <p className="mt-1 text-xs text-muted-foreground">PDF, JPG or PNG up to 10 MB</p>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                className="hidden"
                onChange={(event) => void uploadFile(event.target.files?.[0])}
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? "Uploading…" : "Choose file"}
              </Button>
            </div>
            <EmptyNote>
              {uploading ? "Uploading your file…" : "Files are saved to your patient record."}
            </EmptyNote>
          </Panel>
        </aside>
      </div>
    </>
  );
}
