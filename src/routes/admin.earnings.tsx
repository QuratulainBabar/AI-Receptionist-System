import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Badge,
  Button,
  EmptyNote,
  Input,
  Panel,
} from "@/components/ui/primitives";
import {
  adminApi,
  formatApiError,
  type ApiAdminEarnings,
  type ApiEarningsRangeKey,
} from "@/lib/api";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  DollarSign,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/admin/earnings")({
  head: () => ({
    meta: [{ title: "Earnings — Super Admin" }],
  }),
  component: AdminEarningsPage,
});

const RANGE_OPTIONS: Array<{ value: ApiEarningsRangeKey; label: string }> = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "custom", label: "Custom Range" },
];

const MONTHLY_COLOR = "#2563EB";
const YEARLY_COLOR = "#10B981";

function formatPeriodLabel(period: string, mode: "day" | "month") {
  if (mode === "month") {
    const [y, m] = period.split("-").map(Number);
    if (!y || !m) return period;
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const [y, m, d] = period.split("-").map(Number);
  if (!y || !m || !d) return period;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatPaymentDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ChangeBadge({ pct, onDark }: { pct: number | null; onDark?: boolean }) {
  if (pct == null) return null;
  const positive = pct >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
        onDark
          ? positive
            ? "bg-white/20 text-white"
            : "bg-rose-500/30 text-rose-50"
          : positive
            ? "bg-emerald-50 text-emerald-700"
            : "bg-rose-50 text-rose-700"
      }`}
    >
      {positive ? "+" : ""}
      {pct}% vs prior period
    </span>
  );
}

function AdminEarningsPage() {
  const [data, setData] = useState<ApiAdminEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [range, setRange] = useState<ApiEarningsRangeKey>("this_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [planId, setPlanId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (opts?: { sync?: boolean; page?: number; q?: string }) => {
      setLoading(true);
      setError("");
      try {
        const result = await adminApi.getEarnings({
          range,
          from: range === "custom" && from ? from : undefined,
          to: range === "custom" && to ? to : undefined,
          q: (opts?.q ?? appliedQ) || undefined,
          planId: planId !== "all" ? planId : undefined,
          status: status !== "all" ? status : undefined,
          page: opts?.page ?? page,
          pageSize: 10,
          sync: opts?.sync,
        });
        setData(result.earnings);
        if (opts?.sync && result.earnings.sync) {
          setNotice(
            result.earnings.sync.stripeConfigured
              ? `Synced ${result.earnings.sync.synced} paid invoice${result.earnings.sync.synced === 1 ? "" : "s"} from Stripe.`
              : "Stripe is not configured — showing local payment records only.",
          );
        }
      } catch (err) {
        setError(formatApiError(err, "Unable to load earnings."));
      } finally {
        setLoading(false);
      }
    },
    [range, from, to, appliedQ, planId, status, page],
  );

  const initialSyncRef = useRef(true);

  useEffect(() => {
    const shouldSync = initialSyncRef.current;
    initialSyncRef.current = false;
    void load({ sync: shouldSync });
  }, [range, from, to, planId, status, page, appliedQ, load]);

  const chartData = useMemo(() => {
    if (!data?.chart.points.length) return [];
    return data.chart.points.map((point) => ({
      ...point,
      label: formatPeriodLabel(point.period, data.chart.mode),
      amount: point.amountCents / 100,
    }));
  }, [data]);

  const splitData = useMemo(() => {
    if (!data) return [];
    const monthly = data.billingIntervalTotals.monthlyCollectedCents;
    const yearly = data.billingIntervalTotals.yearlyCollectedCents;
    if (monthly <= 0 && yearly <= 0) return [];
    return [
      { name: "Monthly plans", value: monthly / 100, cents: monthly, color: MONTHLY_COLOR },
      { name: "Yearly plans", value: yearly / 100, cents: yearly, color: YEARLY_COLOR },
    ].filter((row) => row.cents > 0);
  }, [data]);

  function applySearch() {
    setPage(1);
    setAppliedQ(q.trim());
  }

  const summary = data?.summary;

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          <div className="mb-2 inline-flex items-center gap-2 text-blue-600">
            <Wallet className="size-5" strokeWidth={2.2} />
            <span className="text-[13px] font-bold uppercase tracking-[0.08em]">Billing</span>
          </div>
          <h1
            className="font-jakarta font-extrabold tracking-tight text-foreground text-balance"
            style={{
              fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
              letterSpacing: "-0.03em",
            }}
          >
            Platform Earnings
          </h1>
          <p className="mt-2.5 max-w-2xl text-[14.5px] leading-relaxed" style={{ color: "#64748B" }}>
            Subscription revenue and payment analytics across clinics and doctors.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-blue-400"
            value={range}
            onChange={(e) => {
              setPage(1);
              setRange(e.target.value as ApiEarningsRangeKey);
            }}
          >
            {RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {range === "custom" ? (
            <>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setPage(1);
                  setFrom(e.target.value);
                }}
                className="h-10 w-[150px] rounded-xl"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setPage(1);
                  setTo(e.target.value);
                }}
                className="h-10 w-[150px] rounded-xl"
              />
            </>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="gap-2 rounded-xl"
            onClick={() => {
              setNotice("");
              void load({ sync: true });
            }}
          >
            <RefreshCw className="size-4" strokeWidth={2.2} />
            Sync Stripe
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200/70 bg-rose-50/80 p-3.5 text-sm text-rose-700 shadow-sm">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="mb-4 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-3.5 text-sm text-emerald-700 shadow-sm">
          {notice}
        </div>
      ) : null}
      {data && !data.stripeConfigured ? (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-200/70 bg-amber-50/80 p-3.5 text-sm text-amber-800 shadow-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>
            Stripe is not configured. Totals reflect local payment records only. Add STRIPE_SECRET_KEY
            to sync paid invoices.
          </span>
        </div>
      ) : null}

      {loading && !data ? (
        <EmptyNote>Loading earnings…</EmptyNote>
      ) : data ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              label="Total Revenue"
              value={summary?.totalRevenueLabel || "$0.00"}
              detail="Successful subscription payments"
              changePct={summary?.totalRevenueChangePct ?? null}
              icon={<TrendingUp className="size-5" strokeWidth={2.2} />}
            />
            <SummaryCard
              label="Subscription Payments"
              value={summary?.subscriptionPaymentsLabel || "$0.00"}
              detail={`${summary?.paidPaymentCount ?? 0} paid invoice${(summary?.paidPaymentCount ?? 0) === 1 ? "" : "s"}`}
              changePct={summary?.subscriptionPaymentsChangePct ?? null}
              highlighted
              icon={<DollarSign className="size-5" strokeWidth={2.2} />}
            />
            <SummaryCard
              label="Outstanding Payments"
              value={summary?.outstandingLabel || "$0.00"}
              detail={summary?.outstandingNote || "Past-due subscription amounts"}
              icon={<AlertCircle className="size-5" strokeWidth={2.2} />}
            />
            <SummaryCard
              label="Active Subscriptions"
              value={String(summary?.activeSubscriptions ?? 0)}
              detail="Active and trialing doctors"
              icon={<Users className="size-5" strokeWidth={2.2} />}
            />
          </div>

          {data.empty ? (
            <Panel className="mb-6 p-8 text-center">
              <Wallet className="mx-auto size-10 text-slate-300" strokeWidth={1.6} />
              <h2 className="mt-3 font-jakarta text-lg font-bold text-slate-800">No payments yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                When clinics subscribe and Stripe invoices are paid, revenue will appear here
                automatically. You can also sync paid invoices from Stripe.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link to="/admin/subscriptions">
                  <Button variant="outline" className="rounded-xl gap-2">
                    <CreditCard className="size-4" />
                    Manage subscriptions
                  </Button>
                </Link>
                <Button
                  className="rounded-xl gap-2"
                  onClick={() => void load({ sync: true })}
                >
                  <RefreshCw className="size-4" />
                  Sync Stripe invoices
                </Button>
              </div>
            </Panel>
          ) : null}

          <div className="mb-6 grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
            <Panel className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-jakarta text-[17px] font-bold text-slate-900">Revenue over time</h2>
                  <p className="text-[13px] text-slate-500">{data.range.label} · paid invoices only</p>
                </div>
              </div>
              {chartData.length ? (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="earningsArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="#2563EB" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#64748B", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: "#64748B", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `$${v}`}
                      />
                      <Tooltip
                        formatter={(value: number | string) => [
                          typeof value === "number"
                            ? value.toLocaleString(undefined, {
                                style: "currency",
                                currency: (data.currency || "usd").toUpperCase(),
                              })
                            : value,
                          "Revenue",
                        ]}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 8px 24px -16px rgba(15,23,42,0.25)",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="amount"
                        stroke="#2563EB"
                        strokeWidth={2.4}
                        fill="url(#earningsArea)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyNote>No paid subscription invoices in this date range.</EmptyNote>
              )}
            </Panel>

            <Panel className="p-5">
              <div className="mb-4">
                <h2 className="font-jakarta text-[17px] font-bold text-slate-900">Billing interval split</h2>
                <p className="text-[13px] text-slate-500">Collected revenue by monthly vs yearly plans</p>
              </div>
              {splitData.length ? (
                <>
                  <div className="mx-auto h-[200px] w-full max-w-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={splitData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={58}
                          outerRadius={84}
                          paddingAngle={3}
                        >
                          {splitData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number | string) =>
                            typeof value === "number"
                              ? value.toLocaleString(undefined, {
                                  style: "currency",
                                  currency: (data.currency || "usd").toUpperCase(),
                                })
                              : value
                          }
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-3 space-y-2">
                    {splitData.map((row) => (
                      <div key={row.name} className="flex items-center justify-between text-sm">
                        <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                          <span
                            className="inline-block size-2.5 rounded-full"
                            style={{ background: row.color }}
                          />
                          {row.name}
                        </span>
                        <span className="font-bold text-slate-900">
                          {(row.cents / 100).toLocaleString(undefined, {
                            style: "currency",
                            currency: (data.currency || "usd").toUpperCase(),
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyNote>No plan revenue to split for this range.</EmptyNote>
              )}
            </Panel>
          </div>

          <Panel className="mb-6 overflow-hidden p-0">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-jakarta text-[17px] font-bold text-slate-900">
                Subscription revenue by plan
              </h2>
              <p className="text-[13px] text-slate-500">
                Active subscribers and collected revenue for the selected period
              </p>
            </div>
            {data.planBreakdown.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50/80 text-[12px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-5 py-3 font-bold">Plan</th>
                      <th className="px-5 py-3 font-bold">Interval</th>
                      <th className="px-5 py-3 font-bold">Price</th>
                      <th className="px-5 py-3 font-bold">Subscribers</th>
                      <th className="px-5 py-3 font-bold">Collected</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.planBreakdown.map((plan) => (
                      <tr key={plan.planId} className="border-t border-slate-100">
                        <td className="px-5 py-3.5 font-semibold text-slate-900">
                          {plan.planName}
                          {!plan.isActive ? (
                            <Badge className="ml-2 bg-slate-100 text-slate-600">Inactive</Badge>
                          ) : null}
                        </td>
                        <td className="px-5 py-3.5 text-slate-600">{plan.billingCycleLabel}</td>
                        <td className="px-5 py-3.5 text-slate-700">{plan.priceLabel}</td>
                        <td className="px-5 py-3.5 text-slate-700">{plan.subscriberCount}</td>
                        <td className="px-5 py-3.5 font-bold text-blue-700">{plan.collectedLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-5">
                <EmptyNote>No subscription plans configured yet.</EmptyNote>
              </div>
            )}
          </Panel>

          <Panel className="overflow-hidden p-0">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 className="font-jakarta text-[17px] font-bold text-slate-900">
                  Detailed earnings
                </h2>
                <p className="text-[13px] text-slate-500">
                  Individual subscription payments and invoice references
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applySearch();
                    }}
                    placeholder="Search doctor, clinic, invoice…"
                    className="h-10 w-[240px] rounded-xl pl-9"
                  />
                </div>
                <select
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                  value={planId}
                  onChange={(e) => {
                    setPage(1);
                    setPlanId(e.target.value);
                  }}
                >
                  <option value="all">All plans</option>
                  {data.planBreakdown.map((plan) => (
                    <option key={plan.planId} value={plan.planId}>
                      {plan.planName}
                    </option>
                  ))}
                </select>
                <select
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                  value={status}
                  onChange={(e) => {
                    setPage(1);
                    setStatus(e.target.value);
                  }}
                >
                  <option value="all">Paid + refunded</option>
                  <option value="PAID">Paid</option>
                  <option value="REFUNDED">Refunded</option>
                </select>
                <Button type="button" variant="outline" className="rounded-xl" onClick={applySearch}>
                  Search
                </Button>
              </div>
            </div>

            {data.payments.rows.length ? (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50/80 text-[12px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-5 py-3 font-bold">Doctor / Clinic</th>
                        <th className="px-5 py-3 font-bold">Plan</th>
                        <th className="px-5 py-3 font-bold">Interval</th>
                        <th className="px-5 py-3 font-bold">Payment date</th>
                        <th className="px-5 py-3 font-bold">Amount</th>
                        <th className="px-5 py-3 font-bold">Status</th>
                        <th className="px-5 py-3 font-bold">Invoice / Ref</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.rows.map((row) => (
                        <tr key={row.id} className="border-t border-slate-100 align-top">
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-slate-900">{row.doctorName}</div>
                          </td>
                          <td className="px-5 py-3.5 text-slate-700">{row.planName}</td>
                          <td className="px-5 py-3.5 text-slate-600">{row.billingCycleLabel}</td>
                          <td className="px-5 py-3.5 text-slate-600">
                            {formatPaymentDate(row.paymentDate)}
                          </td>
                          <td
                            className={`px-5 py-3.5 font-bold ${
                              row.status === "REFUNDED" ? "text-amber-700" : "text-emerald-700"
                            }`}
                          >
                            {row.amountLabel}
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge
                              className={
                                row.status === "PAID"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : row.status === "REFUNDED"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-rose-50 text-rose-700"
                              }
                            >
                              {row.statusLabel}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="font-mono text-[12px] text-slate-700">
                              {row.invoiceReference || "—"}
                            </div>
                            {row.subscriptionId ? (
                              <Link
                                to="/admin/subscriptions"
                                className="mt-1 inline-block text-[12px] font-semibold text-blue-600 hover:underline"
                              >
                                View subscriptions
                              </Link>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
                  <p className="text-[13px] text-slate-500">
                    Showing page {data.payments.page} of {data.payments.totalPages} ·{" "}
                    {data.payments.total} payment{data.payments.total === 1 ? "" : "s"}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      <ChevronLeft className="size-4" />
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      disabled={page >= data.payments.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-5">
                <EmptyNote>No payment records match this filter.</EmptyNote>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  changePct,
  highlighted,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  changePct?: number | null;
  highlighted?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl p-5 transition-all duration-300 hover:-translate-y-0.5 ${
        highlighted
          ? "text-white shadow-[0_18px_44px_-18px_rgba(37,99,235,0.55)]"
          : "hover:shadow-[0_18px_44px_-18px_rgba(37,99,235,0.28)]"
      }`}
      style={
        highlighted
          ? {
              background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
            }
          : {
              background: "linear-gradient(180deg, #FFFFFF 0%, #F8FBFF 100%)",
              border: "1px solid #E2E8F0",
              boxShadow: "0 1px 2px 0 rgba(15,23,42,0.04), 0 10px 30px -16px rgba(37,99,235,0.18)",
            }
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[13px] font-bold ${highlighted ? "text-blue-100" : "text-slate-500"}`}>
            {label}
          </p>
          <p
            className={`mt-2 font-sans text-[30px] font-black leading-none tracking-tight ${
              highlighted ? "text-white" : "text-slate-900"
            }`}
          >
            {value}
          </p>
          <div className="mt-3">
            <ChangeBadge pct={changePct ?? null} onDark={highlighted} />
          </div>
        </div>
        <div
          className={`grid size-11 shrink-0 place-items-center rounded-2xl ${
            highlighted ? "bg-white/15 text-white" : "bg-blue-50 text-blue-600"
          }`}
        >
          {icon}
        </div>
      </div>
      <p className={`mt-4 text-[12px] ${highlighted ? "text-blue-100" : "text-slate-500"}`}>
        {detail}
      </p>
    </div>
  );
}
