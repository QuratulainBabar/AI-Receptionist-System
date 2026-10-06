import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Badge, Button, EmptyNote, Field, Input, PageHeader, Panel, SectionLabel, StatCard, Textarea } from "@/components/ui/primitives";
import {
  adminApi,
  formatApiError,
  type ApiAdminDoctor,
  type ApiBillingCycle,
  type ApiSubscription,
  type ApiSubscriptionOverview,
  type ApiSubscriptionPlan,
} from "@/lib/api";

export const Route = createFileRoute("/admin/subscriptions")({
  head: () => ({
    meta: [{ title: "Subscriptions — Super Admin" }],
  }),
  component: AdminSubscriptionsPage,
});

type Tab = "plans" | "subscribers";

const emptyForm = {
  name: "",
  description: "",
  price: "29",
  billingCycle: "MONTHLY" as ApiBillingCycle,
  features: "AI receptionist\nAppointment booking\nPatient records",
  trialDays: "0",
  sortOrder: "0",
};

function statusTone(status: string) {
  const value = status.toLowerCase();
  if (value === "active") return "success" as const;
  if (value === "trialing") return "primary" as const;
  if (value === "past due") return "warning" as const;
  if (value === "cancelled" || value === "expired") return "destructive" as const;
  return "muted" as const;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function AdminSubscriptionsPage() {
  const [tab, setTab] = useState<Tab>("plans");
  const [overview, setOverview] = useState<ApiSubscriptionOverview | null>(null);
  const [plans, setPlans] = useState<ApiSubscriptionPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<ApiSubscription[]>([]);
  const [doctors, setDoctors] = useState<ApiAdminDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assignUserId, setAssignUserId] = useState("");
  const [assignPlanId, setAssignPlanId] = useState("");
  const [detail, setDetail] = useState<ApiSubscription | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [overviewResult, plansResult, subsResult, doctorsResult] = await Promise.all([
        adminApi.subscriptionOverview(),
        adminApi.listSubscriptionPlans(),
        adminApi.listSubscriptions(),
        adminApi.listDoctors(),
      ]);
      setOverview(overviewResult.overview);
      setPlans(plansResult.plans);
      setSubscriptions(subsResult.subscriptions);
      setDoctors(doctorsResult.users);
    } catch (err) {
      setError(formatApiError(err, "Unable to load subscriptions."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredSubs = useMemo(() => {
    const query = q.trim().toLowerCase();
    return subscriptions.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!query) return true;
      return [row.doctorName, row.doctorEmail, row.doctorReference, row.planName, row.stripeSubscriptionId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [q, statusFilter, subscriptions]);

  function fillForm(plan: ApiSubscriptionPlan) {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      description: plan.description,
      price: String(plan.amountCents / 100),
      billingCycle: plan.billingCycle,
      features: plan.features.join("\n"),
      trialDays: String(plan.trialDays),
      sortOrder: String(plan.sortOrder),
    });
    setNotice("");
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function savePlan(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const amountCents = Math.round(Number(form.price) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 50) {
      setError("Enter a valid price of at least $0.50.");
      setSaving(false);
      return;
    }
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      amountCents,
      billingCycle: form.billingCycle,
      features: form.features
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      trialDays: Number(form.trialDays) || 0,
      sortOrder: Number(form.sortOrder) || 0,
    };
    try {
      const result = editingId
        ? await adminApi.updateSubscriptionPlan(editingId, payload)
        : await adminApi.createSubscriptionPlan(payload);
      setNotice(result.message || "Plan saved.");
      resetForm();
      await load();
    } catch (err) {
      setError(formatApiError(err, "Unable to save this plan in Stripe."));
    } finally {
      setSaving(false);
    }
  }

  async function togglePlan(plan: ApiSubscriptionPlan) {
    setError("");
    setNotice("");
    try {
      const result = await adminApi.setSubscriptionPlanActive(plan.id, !plan.isActive);
      setNotice(result.message || "Plan status updated.");
      await load();
    } catch (err) {
      setError(formatApiError(err, "Unable to update plan status."));
    }
  }

  async function assignPlan() {
    if (!assignUserId || !assignPlanId) {
      setError("Choose a doctor and a plan to assign.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await adminApi.assignSubscription(assignUserId, assignPlanId);
      setNotice(result.message || "Subscription assigned.");
      await load();
    } catch (err) {
      setError(formatApiError(err, "Unable to assign this plan."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Billing"
        title="Subscriptions"
        description="Create Stripe plans, assign doctors, and track live subscription status from Stripe webhooks."
        actions={
          <Button type="button" variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-primary">{notice}</p> : null}
      {overview && !overview.stripeConfigured ? (
        <p className="mb-4 text-sm text-warning-foreground">
          Stripe test keys are missing. Add STRIPE_SECRET_KEY to backend/.env, then restart the API.
        </p>
      ) : null}

      {loading && !overview ? (
        <EmptyNote>Loading subscriptions…</EmptyNote>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Current subscribers" value={String(overview?.currentSubscribers ?? 0)} detail="Active + trialing + past due" />
          <StatCard label="Active" value={String(overview?.active ?? 0)} detail={`${overview?.trialing ?? 0} trialing`} />
          <StatCard label="Past due" value={String(overview?.pastDue ?? 0)} detail={`${overview?.cancelled ?? 0} cancelled`} />
          <StatCard label="Plans" value={String(overview?.activePlans ?? 0)} detail={`${overview?.plans ?? 0} total`} />
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <Button type="button" size="sm" variant={tab === "plans" ? "primary" : "outline"} onClick={() => setTab("plans")}>
          Plans
        </Button>
        <Button type="button" size="sm" variant={tab === "subscribers" ? "primary" : "outline"} onClick={() => setTab("subscribers")}>
          Doctors & status
        </Button>
      </div>

      {tab === "plans" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3">
            {!plans.length ? (
              <EmptyNote>No plans yet. Create Starter, Professional, or Enterprise on the right.</EmptyNote>
            ) : (
              plans.map((plan) => (
                <Panel key={plan.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{plan.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {plan.amountLabel} / {plan.billingCycleLabel.toLowerCase()}
                        {plan.trialDays ? ` · ${plan.trialDays}-day trial` : ""}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{plan.stripePriceId}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={plan.isActive ? "success" : "muted"}>{plan.isActive ? "Active" : "Inactive"}</Badge>
                      <Badge>{plan.subscriberCount} subscribed</Badge>
                    </div>
                  </div>
                  {plan.features.length ? (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-4 flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => fillForm(plan)}>
                      Edit
                    </Button>
                    <Button type="button" size="sm" variant={plan.isActive ? "danger" : "soft"} onClick={() => void togglePlan(plan)}>
                      {plan.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </Panel>
              ))
            )}
          </div>

          <Panel className="h-fit p-4">
            <SectionLabel>{editingId ? "Edit plan" : "Create plan"}</SectionLabel>
            <form className="mt-4 space-y-3" onSubmit={(event) => void savePlan(event)}>
              <Field label="Plan name">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Professional" required />
              </Field>
              <Field label="Price (USD)">
                <Input type="number" min="0.5" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </Field>
              <Field label="Billing cycle">
                <select
                  className="h-10 w-full rounded-xl border border-border bg-card px-3 text-sm"
                  value={form.billingCycle}
                  onChange={(e) => setForm({ ...form, billingCycle: e.target.value as ApiBillingCycle })}
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </Field>
              <Field label="Trial days" hint="0 for no trial">
                <Input type="number" min="0" max="90" value={form.trialDays} onChange={(e) => setForm({ ...form, trialDays: e.target.value })} />
              </Field>
              <Field label="Description">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="For growing clinics" />
              </Field>
              <Field label="Features" hint="One per line">
                <Textarea rows={5} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Update plan" : "Create in Stripe"}
                </Button>
                {editingId ? (
                  <Button type="button" variant="ghost" onClick={resetForm}>
                    Cancel
                  </Button>
                ) : null}
              </div>
            </form>
          </Panel>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Panel className="p-4">
            <SectionLabel>Assign a plan to a doctor</SectionLabel>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <select
                className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
              >
                <option value="">Select doctor</option>
                {doctors.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.fullName} · {doctor.email}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-xl border border-border bg-card px-3 text-sm"
                value={assignPlanId}
                onChange={(e) => setAssignPlanId(e.target.value)}
              >
                <option value="">Select plan</option>
                {plans.filter((plan) => plan.isActive).map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.amountLabel}
                  </option>
                ))}
              </select>
              <Button type="button" disabled={saving} onClick={() => void assignPlan()}>
                Assign
              </Button>
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input placeholder="Search doctor, email, or Stripe ID" value={q} onChange={(e) => setQ(e.target.value)} className="sm:flex-1" />
              <div className="flex flex-wrap gap-1.5">
                {["all", "ACTIVE", "TRIALING", "PAST_DUE", "CANCELLED", "EXPIRED"].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={statusFilter === value ? "primary" : "outline"}
                    onClick={() => setStatusFilter(value)}
                  >
                    {value === "all" ? "All" : value.replace("_", " ")}
                  </Button>
                ))}
              </div>
            </div>
          </Panel>

          {!filteredSubs.length ? (
            <EmptyNote>No doctor subscriptions match this filter.</EmptyNote>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">Doctor</th>
                    <th className="pb-2 pr-3 font-medium">Plan</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Started</th>
                    <th className="pb-2 pr-3 font-medium">Next billing</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubs.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="py-3 pr-3">
                        <p className="font-medium">{row.doctorName}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{row.doctorEmail}</p>
                      </td>
                      <td className="py-3 pr-3">
                        {row.planName}
                        <p className="text-xs text-muted-foreground">
                          {row.amountLabel} / {row.billingCycleLabel.toLowerCase()}
                        </p>
                      </td>
                      <td className="py-3 pr-3">
                        <Badge tone={statusTone(row.statusLabel)}>{row.statusLabel}</Badge>
                      </td>
                      <td className="py-3 pr-3">{formatDate(row.currentPeriodStart || row.createdAt)}</td>
                      <td className="py-3 pr-3">{formatDate(row.currentPeriodEnd)}</td>
                      <td className="py-3">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDetail(row)}>
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {detail ? (
            <Panel className="p-4">
              <div className="flex items-center justify-between gap-3">
                <SectionLabel>Subscription details</SectionLabel>
                <Button type="button" size="sm" variant="ghost" onClick={() => setDetail(null)}>
                  Close
                </Button>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Doctor</dt>
                  <dd>{detail.doctorName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Plan</dt>
                  <dd>{detail.planName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Amount</dt>
                  <dd>{detail.amountLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Billing cycle</dt>
                  <dd>{detail.billingCycleLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd>{detail.statusLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Start date</dt>
                  <dd>{formatDate(detail.currentPeriodStart || detail.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Next billing date</dt>
                  <dd>{formatDate(detail.currentPeriodEnd)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Stripe subscription</dt>
                  <dd className="font-mono text-xs">{detail.stripeSubscriptionId}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Stripe customer</dt>
                  <dd className="font-mono text-xs">{detail.stripeCustomerId}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Stripe price</dt>
                  <dd className="font-mono text-xs">{detail.stripePriceId}</dd>
                </div>
              </dl>
              <Link to="/admin/doctors/$userId" params={{ userId: detail.userId }} className="mt-4 inline-block">
                <Button variant="outline" size="sm">
                  Open doctor CRM
                </Button>
              </Link>
            </Panel>
          ) : null}
        </div>
      )}
    </>
  );
}
