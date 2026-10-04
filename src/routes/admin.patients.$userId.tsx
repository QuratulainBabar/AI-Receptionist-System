import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { adminApi, formatApiError, type ApiUser } from "@/lib/api";

export const Route = createFileRoute("/admin/patients/$userId")({
  head: () => ({
    meta: [{ title: "Patient details — Super Admin" }],
  }),
  component: AdminPatientDetails,
});

function AdminPatientDetails() {
  const { userId } = Route.useParams();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void adminApi
      .getUser(userId)
      .then((result) => setUser(result.user))
      .catch((err) => setError(formatApiError(err, "Unable to load patient.")))
      .finally(() => setLoading(false));
  }, [userId]);

  async function toggleStatus() {
    if (!user) return;
    try {
      const result = await adminApi.setStatus(user.id, !user.isActive);
      setUser(result.user);
    } catch (err) {
      setError(formatApiError(err, "Unable to update status."));
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Patient file"
        title={user?.fullName ?? "Patient details"}
        description={user ? `${user.reference} · ${user.email}` : "Loading account details."}
        actions={
          <>
            <Link to="/admin/patients">
              <Button variant="outline">Back to list</Button>
            </Link>
            {user ? (
              <Button variant={user.isActive ? "danger" : "primary"} onClick={() => void toggleStatus()}>
                {user.isActive ? "Deactivate" : "Activate"}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

      {user ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel className="p-4">
            <SectionLabel>Account</SectionLabel>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2 border-b border-border pb-2">
                <dt className="text-muted-foreground">Full name</dt>
                <dd className="font-medium">{user.fullName}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border pb-2">
                <dt className="text-muted-foreground">Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border pb-2">
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="font-mono text-[11px]">{user.reference}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border pb-2">
                <dt className="text-muted-foreground">Role</dt>
                <dd className="capitalize">{user.role}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="font-mono text-[11px]">
                  {user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}
                </dd>
              </div>
            </dl>
          </Panel>
          <Panel className="p-4">
            <SectionLabel>Status</SectionLabel>
            <div className="mt-3 flex items-center gap-2">
              <Badge tone={user.isActive ? "success" : "destructive"}>
                {user.isActive ? "Active" : "Inactive"}
              </Badge>
              <p className="text-sm text-muted-foreground">
                {user.isActive
                  ? "This patient can sign in to the patient portal."
                  : "This patient cannot sign in until reactivated."}
              </p>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
