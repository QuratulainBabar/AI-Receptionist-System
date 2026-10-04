import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyNote, Input, PageHeader, Panel } from "@/components/ui/primitives";
import { adminApi, formatApiError, type ApiUser } from "@/lib/api";

export const Route = createFileRoute("/admin/patients")({
  head: () => ({
    meta: [{ title: "Manage patients — Super Admin" }],
  }),
  component: AdminPatientsLayout,
});

function AdminPatientsLayout() {
  const matches = useMatches();
  const isDetail = matches.some((match) => match.routeId === "/admin/patients/$userId");
  if (isDetail) return <Outlet />;
  return <AdminPatientsPage />;
}

function AdminPatientsPage() {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(nextQ = appliedQ, nextStatus = status) {
    setLoading(true);
    setError("");
    try {
      const result = await adminApi.listPatients({ q: nextQ || undefined, status: nextStatus });
      setUsers(result.users);
    } catch (err) {
      setError(formatApiError(err, "Unable to load patients."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleStatus(user: ApiUser) {
    try {
      const result = await adminApi.setStatus(user.id, !user.isActive);
      setUsers((current) => current.map((item) => (item.id === user.id ? result.user : item)));
    } catch (err) {
      setError(formatApiError(err, "Unable to update status."));
    }
  }

  return (
    <>
      <PageHeader eyebrow="Users" title="Patients" description="Search and manage patient accounts." />

      <Panel className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Search name, email or reference"
            className="sm:flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setAppliedQ(q);
                void load(q, status);
              }
            }}
          />
          <Button
            type="button"
            onClick={() => {
              setAppliedQ(q);
              void load(q, status);
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
                void load(appliedQ, value);
              }}
            >
              {value}
            </Button>
          ))}
        </div>
      </Panel>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <EmptyNote>Loading patients…</EmptyNote>
      ) : users.length === 0 ? (
        <EmptyNote>No patients match this search.</EmptyNote>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <Panel key={user.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{user.fullName}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">{user.reference}</p>
              </div>
              <Badge tone={user.isActive ? "success" : "destructive"}>
                {user.isActive ? "Active" : "Inactive"}
              </Badge>
              <Link to="/admin/patients/$userId" params={{ userId: user.id }}>
                <Button variant="outline" size="sm">
                  Details
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
