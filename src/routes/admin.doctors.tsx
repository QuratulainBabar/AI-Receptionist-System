import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyNote, Input, PageHeader, Panel } from "@/components/ui/primitives";
import { adminApi, formatApiError, type ApiAdminDoctor } from "@/lib/api";

export const Route = createFileRoute("/admin/doctors")({
  head: () => ({
    meta: [{ title: "Manage doctors — Super Admin" }],
  }),
  component: AdminDoctorsLayout,
});

function AdminDoctorsLayout() {
  const matches = useMatches();
  const isDetail = matches.some((match) => match.routeId === "/admin/doctors/$userId");
  if (isDetail) return <Outlet />;
  return <AdminDoctorsPage />;
}

function AdminDoctorsPage() {
  const [users, setUsers] = useState<ApiAdminDoctor[]>([]);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [verification, setVerification] = useState<"all" | "verified" | "unverified">("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);

  async function load(
    nextQ = appliedQ,
    nextStatus = status,
    nextVerification = verification,
  ) {
    setLoading(true);
    setError("");
    try {
      const result = await adminApi.listDoctors({
        q: nextQ || undefined,
        status: nextStatus,
        verification: nextVerification,
      });
      setUsers(result.users);
    } catch (err) {
      setError(formatApiError(err, "Unable to load doctors."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleStatus(user: ApiAdminDoctor) {
    try {
      const result = await adminApi.setStatus(user.id, !user.isActive);
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id ? { ...item, ...result.user, isActive: result.user.isActive } : item,
        ),
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to update status."));
    }
  }

  async function syncSynthflow() {
    setSyncBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminApi.syncSynthflowDirectory();
      const count = result.settings.doctorsCount;
      setNotice(
        result.warning
          ? `Clinic doctor synced. ${result.warning}`
          : count === 0
            ? "Synced, but no active doctor profile was found for the phone AI."
            : "Clinic doctor profile synced to the Synthflow agent.",
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to sync the clinic doctor with Synthflow."));
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Doctors"
        description="Manage accounts, clinical profiles, and Synthflow verification."
        actions={
          <Button type="button" variant="outline" disabled={syncBusy} onClick={() => void syncSynthflow()}>
            {syncBusy ? "Syncing…" : "Sync Synthflow"}
          </Button>
        }
      />

      <Panel className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Search name, email, reference, specialty, or clinic"
            className="sm:flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setAppliedQ(q);
                void load(q, status, verification);
              }
            }}
          />
          <Button
            type="button"
            onClick={() => {
              setAppliedQ(q);
              void load(q, status, verification);
            }}
          >
            Search
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(["all", "active", "inactive"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={status === value ? "primary" : "outline"}
              onClick={() => {
                setStatus(value);
                void load(appliedQ, value, verification);
              }}
            >
              {value}
            </Button>
          ))}
          {(["all", "verified", "unverified"] as const).map((value) => (
            <Button
              key={`v-${value}`}
              type="button"
              size="sm"
              variant={verification === value ? "soft" : "outline"}
              onClick={() => {
                setVerification(value);
                void load(appliedQ, status, value);
              }}
            >
              {value === "all" ? "All verification" : value}
            </Button>
          ))}
        </div>
      </Panel>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-success">{notice}</p> : null}

      {loading ? (
        <EmptyNote>Loading doctors…</EmptyNote>
      ) : users.length === 0 ? (
        <EmptyNote>No doctors match this search.</EmptyNote>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Panel key={user.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{user.fullName}</p>
                <p className="text-xs text-muted-foreground">
                  {user.specialty || "No specialty"} · {user.clinic || "No clinic"} · {user.fee || "—"}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {user.reference} · {user.email}
                </p>
              </div>
              <Badge tone={user.isVerified ? "success" : "warning"}>
                {user.isVerified ? "Verified" : "Unverified"}
              </Badge>
              <Badge
                tone={
                  user.subscriptionStatus === "Active" || user.subscriptionStatus === "Trialing"
                    ? "success"
                    : user.subscriptionStatus
                      ? "warning"
                      : "muted"
                }
              >
                {user.subscriptionStatus || "No plan"}
              </Badge>
              <Badge tone={user.isActive ? "success" : "destructive"}>
                {user.isActive ? "Active" : "Inactive"}
              </Badge>
              <Link to="/admin/doctors/$userId" params={{ userId: user.id }}>
                <Button variant="outline" size="sm">
                  CRM profile
                </Button>
              </Link>
              <Button variant={user.isActive ? "danger" : "soft"} size="sm" onClick={() => void toggleStatus(user)}>
                {user.isActive ? "Deactivate" : "Activate"}
              </Button>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
