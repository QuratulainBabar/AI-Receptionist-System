import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Button,
  EmptyNote,
  Field,
  Input,
  Textarea,
} from "@/components/ui/primitives";
import {
  Users,
  Zap,
  Clock,
  FileText,
  Calendar,
  Plus,
  UserPlus,
  Check,
  RefreshCw,
} from "lucide-react";
import {
  adminApi,
  formatApiError,
  type ApiBillingCycle,
  type ApiSubscriptionOverview,
  type ApiSubscriptionPlan,
} from "@/lib/api";

export const Route = createFileRoute("/admin/subscriptions")({
  head: () => ({
    meta: [{ title: "Subscriptions — Super Admin" }],
  }),
  component: AdminSubscriptionsPage,
});

const emptyForm = {
  name: "",
  description: "",
  price: "29",
  billingCycle: "MONTHLY" as ApiBillingCycle,
  features: "AI receptionist\nAppointment booking\nPatient records",
  trialDays: "0",
  sortOrder: "0",
};

const PLAN_ICON_MAP: Record<string, { icon: React.ReactNode; bg: string; iconColor: string }> = {
  starter: {
    icon: <span className="font-display font-black text-[22px] text-white tracking-tight">S</span>,
    bg: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
    iconColor: "#FFFFFF",
  },
  professional: {
    icon: <span className="font-display font-black text-[22px] text-white tracking-tight">P</span>,
    bg: "linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)",
    iconColor: "#FFFFFF",
  },
  enterprise: {
    icon: <span className="font-display font-black text-[22px] text-white tracking-tight">E</span>,
    bg: "linear-gradient(135deg, #6366F1 0%, #4338CA 100%)",
    iconColor: "#FFFFFF",
  },
};

function getPlanIconStyle(planName: string) {
  const n = planName.toLowerCase();
  if (n.includes("starter")) return PLAN_ICON_MAP.starter;
  if (n.includes("professional")) return PLAN_ICON_MAP.professional;
  if (n.includes("enterprise")) return PLAN_ICON_MAP.enterprise;
  return PLAN_ICON_MAP.starter;
}

const DEFAULT_FEATURES = [
  "AI receptionist",
  "Appointment booking",
  "Patient records",
  "Doctor calendar",
  "Medical records and reports",
  "Automated appointment reminders",
  "Follow-up scheduling",
  "SMS notifications",
  "Advanced dashboard",
];

function AdminSubscriptionsPage() {
  const [overview, setOverview] = useState<ApiSubscriptionOverview | null>(null);
  const [plans, setPlans] = useState<ApiSubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [overviewResult, plansResult] = await Promise.all([
        adminApi.subscriptionOverview(),
        adminApi.listSubscriptionPlans(),
      ]);
      setOverview(overviewResult.overview);
      setPlans(plansResult.plans);
    } catch (err) {
      setError(formatApiError(err, "Unable to load subscriptions."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeLabel = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <div
        className="relative mb-8 overflow-hidden rounded-3xl px-6 pb-6 pt-5 md:px-8 md:pb-7 md:pt-5 lg:px-10 lg:pb-8 lg:pt-5"
        style={{
          backgroundColor: "#F4F7FF",
          backgroundImage: `
            linear-gradient(90deg, rgba(244,247,255,0.98) 0%, rgba(244,247,255,0.96) 38%, rgba(244,247,255,0.55) 52%, rgba(244,247,255,0.08) 68%, rgba(244,247,255,0.02) 100%),
            url("/images/Minimal%20Stripe%20Analytics%20Dashboard%20with%20Growth%20Chart.png")
          `,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center, left center",
          backgroundSize: "auto, cover",
          border: "1px solid rgba(59,130,246,0.15)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute right-4 top-4 z-10 flex flex-col items-end gap-3"
        >
          <div className="inline-flex items-center gap-3 rounded-2xl border border-white/70 bg-white/85 px-5 py-3 text-[13px] shadow-[0_10px_30px_-14px_rgba(30,64,175,0.25)] backdrop-blur">
            <Calendar className="size-4.5 text-blue-600" strokeWidth={2.1} />
            <span className="font-bold text-slate-700">{todayLabel}</span>
            <span className="text-slate-300">·</span>
            <span className="font-semibold text-slate-500">{timeLabel}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            className="gap-2.5 rounded-2xl border border-white/70 bg-white/85 px-5 py-3 text-[13px] font-bold shadow-[0_8px_26px_-14px_rgba(30,64,175,0.22)] backdrop-blur hover:bg-white"
          >
            <RefreshCw className="size-4.5" strokeWidth={2.2} />
            Refresh
          </Button>
        </div>
        <div className="relative z-10 max-w-[19rem] pt-24 sm:max-w-[26rem] sm:pt-0 lg:max-w-[24rem] xl:max-w-[28rem]">
            <h1 className="font-[--font-display] text-[clamp(2.1rem,3.6vw,3.15rem)] font-black leading-[1.02] tracking-tight">
              Manage Your
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #2563EB 0%, #1E3A8A 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Subscriptions
              </span>
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-600">
              Create Stripe plans, assign doctors, and
              <br />
              track live subscription status from Stripe webhooks.
            </p>
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
      {overview && !overview.stripeConfigured ? (
        <div className="mb-4 rounded-2xl border border-amber-200/70 bg-amber-50/80 p-3.5 text-sm text-amber-800 shadow-sm">
          Stripe test keys are missing. Add STRIPE_SECRET_KEY to backend/.env, then restart the API.
        </div>
      ) : null}

      {loading && !overview ? (
        <EmptyNote>Loading subscriptions…</EmptyNote>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div
            className="relative overflow-hidden rounded-3xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-18px_rgba(37,99,235,0.35)]"
            style={{
              background: "linear-gradient(180deg, #FFFFFF 0%, #F8FBFF 100%)",
              border: "1px solid #E2E8F0",
              boxShadow: "0 1px 2px 0 rgba(15,23,42,0.04), 0 10px 30px -16px rgba(37,99,235,0.18)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div
                className="grid size-12 shrink-0 place-items-center rounded-2xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0.05) 100%)",
                }}
              >
                <Users className="size-6" strokeWidth={2.3} style={{ color: "#2563EB" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-slate-500">Current Subscribers</p>
                <p className="mt-2 font-[--font-display] text-[30px] font-black leading-none tracking-tight text-slate-900">
                  {overview?.currentSubscribers ?? 0}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-end gap-3">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-24 shrink-0">
                <defs>
                  <linearGradient id="kpi1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 75 L15 60 L30 68 L45 45 L60 52 L75 35 L90 42 L100 20 L100 100 L0 100 Z"
                  fill="url(#kpi1)"
                />
                <path
                  d="M0 75 L15 60 L30 68 L45 45 L60 52 L75 35 L90 42 L100 20"
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-3xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-18px_rgba(37,99,235,0.35)]"
            style={{
              background: "linear-gradient(180deg, #FFFFFF 0%, #F8FBFF 100%)",
              border: "1px solid #E2E8F0",
              boxShadow: "0 1px 2px 0 rgba(15,23,42,0.04), 0 10px 30px -16px rgba(37,99,235,0.18)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div
                className="grid size-12 shrink-0 place-items-center rounded-2xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0.05) 100%)",
                }}
              >
                <Zap className="size-6" strokeWidth={2.4} style={{ color: "#2563EB" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-slate-500">Active</p>
                <p className="mt-2 font-[--font-display] text-[30px] font-black leading-none tracking-tight text-slate-900">
                  {overview?.active ?? 0}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-end gap-3">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-24 shrink-0">
                <defs>
                  <linearGradient id="kpi2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 70 L18 58 L36 64 L54 42 L72 36 L90 46 L100 28 L100 100 L0 100 Z"
                  fill="url(#kpi2)"
                />
                <path
                  d="M0 70 L18 58 L36 64 L54 42 L72 36 L90 46 L100 28"
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-3xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-18px_rgba(37,99,235,0.35)]"
            style={{
              background: "linear-gradient(180deg, #FFFFFF 0%, #F8FBFF 100%)",
              border: "1px solid #E2E8F0",
              boxShadow: "0 1px 2px 0 rgba(15,23,42,0.04), 0 10px 30px -16px rgba(37,99,235,0.18)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div
                className="grid size-12 shrink-0 place-items-center rounded-2xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0.05) 100%)",
                }}
              >
                <Clock className="size-6" strokeWidth={2.3} style={{ color: "#2563EB" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-slate-500">Past due</p>
                <p className="mt-2 font-[--font-display] text-[30px] font-black leading-none tracking-tight text-slate-900">
                  {overview?.pastDue ?? 0}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-end gap-3">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-24 shrink-0">
                <defs>
                  <linearGradient id="kpi3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 65 L20 52 L40 58 L60 40 L80 34 L100 42 L100 100 L0 100 Z"
                  fill="url(#kpi3)"
                />
                <path
                  d="M0 65 L20 52 L40 58 L60 40 L80 34 L100 42"
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-3xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_44px_-18px_rgba(37,99,235,0.35)]"
            style={{
              background: "linear-gradient(180deg, #FFFFFF 0%, #F8FBFF 100%)",
              border: "1px solid #E2E8F0",
              boxShadow: "0 1px 2px 0 rgba(15,23,42,0.04), 0 10px 30px -16px rgba(37,99,235,0.18)",
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div
                className="grid size-12 shrink-0 place-items-center rounded-2xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(37,99,235,0.12) 0%, rgba(37,99,235,0.05) 100%)",
                }}
              >
                <FileText className="size-6" strokeWidth={2.3} style={{ color: "#2563EB" }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-slate-500">Plans</p>
                <p className="mt-2 font-[--font-display] text-[30px] font-black leading-none tracking-tight text-slate-900">
                  {overview?.activePlans ?? 0}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-end justify-end gap-3">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-24 shrink-0">
                <defs>
                  <linearGradient id="kpi4" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 72 L15 60 L30 42 L45 50 L60 30 L75 38 L90 22 L100 28 L100 100 L0 100 Z"
                  fill="url(#kpi4)"
                />
                <path
                  d="M0 72 L15 60 L30 42 L45 50 L60 30 L75 38 L90 22 L100 28"
                  fill="none"
                  stroke="#2563EB"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      )}


        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            {!plans.length ? (
              <EmptyNote>
                No plans yet. Create Starter, Professional, or Enterprise on the right.
              </EmptyNote>
            ) : (
              plans.map((plan) => {
                const iconCfg = getPlanIconStyle(plan.name);
                const featureList = plan.features.length ? plan.features : DEFAULT_FEATURES;
                return (
                  <div
                    key={plan.id}
                    className="relative overflow-hidden rounded-[28px] p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_55px_-22px_rgba(30,64,175,0.28)]"
                    style={{
                      background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFF 100%)",
                      border: "1px solid #E2E8F0",
                      boxShadow:
                        "0 1px 2px 0 rgba(15,23,42,0.04), 0 12px 32px -18px rgba(30,64,175,0.18)",
                    }}
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 opacity-[0.35]"
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 100% 100%, rgba(59,130,246,0.08) 0%, transparent 55%), radial-gradient(circle at 90% 0%, rgba(129,140,248,0.07) 0%, transparent 45%)",
                      }}
                    />
                    <div className="relative flex flex-wrap items-start justify-between gap-4">
                      <div className="flex gap-4">
                        <div
                          className="grid size-16 shrink-0 place-items-center rounded-3xl shadow-[0_8px_22px_-8px_rgba(37,99,235,0.55)]"
                          style={{ background: iconCfg.bg, color: iconCfg.iconColor }}
                        >
                          {iconCfg.icon}
                        </div>
                        <div className="min-w-0 pt-1">
                          <h3 className="font-[--font-display] text-[20px] font-black tracking-tight text-slate-900">
                            {plan.name}
                          </h3>
                          <p className="mt-1 flex items-baseline gap-1">
                            <span className="font-[--font-display] text-[22px] font-black tracking-tight text-slate-900">
                              {plan.amountLabel}
                            </span>
                            <span className="text-[13px] font-semibold text-slate-500">
                              / {plan.billingCycleLabel.toLowerCase()}
                            </span>
                          </p>
                          <p className="mt-1.5 font-mono text-[11px] tracking-tight text-slate-400">
                            {plan.stripePriceId}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-bold tracking-wide ${
                            plan.isActive ? "text-emerald-700" : "text-slate-600"
                          }`}
                          style={{
                            background: plan.isActive
                              ? "rgba(16,185,129,0.12)"
                              : "rgba(148,163,184,0.16)",
                            border: `1px solid ${plan.isActive ? "rgba(16,185,129,0.28)" : "rgba(148,163,184,0.35)"}`,
                          }}
                        >
                          <span
                            className={`size-1.5 rounded-full ${plan.isActive ? "bg-emerald-500" : "bg-slate-400"}`}
                          />
                          {plan.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-[11.5px] font-bold text-slate-600"
                          style={{ border: "1px solid #E2E8F0" }}
                        >
                          <UserPlus className="size-3.5" strokeWidth={2.3} />
                          {plan.subscriberCount} SUBSCRIBED
                        </span>
                      </div>
                    </div>

                    <div className="relative mt-6 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      {featureList.map((f) => (
                        <div
                          key={f}
                          className="flex items-start gap-2.5 text-[13.5px] text-slate-600"
                        >
                          <span
                            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white"
                            style={{
                              background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                            }}
                          >
                            <Check className="size-3" strokeWidth={3.5} />
                          </span>
                          <span className="pt-0.5 font-medium leading-snug">{f}</span>
                        </div>
                      ))}
                    </div>

                    <div className="relative mt-7 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => fillForm(plan)}
                        className="inline-flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-[13px] font-bold transition-all hover:-translate-y-0.5"
                        style={{
                          borderColor: "rgba(37,99,235,0.28)",
                          color: "#1D4ED8",
                          background: "rgba(37,99,235,0.05)",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void togglePlan(plan)}
                        className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-[13px] font-bold transition-all hover:-translate-y-0.5 ${
                          plan.isActive ? "text-rose-600" : "text-slate-700"
                        }`}
                        style={{
                          borderColor: plan.isActive
                            ? "rgba(244,63,94,0.28)"
                            : "rgba(148,163,184,0.4)",
                          background: plan.isActive
                            ? "rgba(244,63,94,0.05)"
                            : "rgba(148,163,184,0.1)",
                        }}
                      >
                        {plan.isActive ? "Deactivate" : "Activate"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="h-fit">
            <div
              className="overflow-hidden rounded-[28px] shadow-[0_24px_60px_-22px_rgba(30,64,175,0.38)]"
              style={{
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
              }}
            >
              <div
                className="relative overflow-hidden px-6 pt-6 pb-7"
                style={{
                  background: "linear-gradient(135deg, #0F172A 0%, #1E3A8A 50%, #2563EB 100%)",
                  color: "#FFFFFF",
                }}
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 100% 0%, rgba(96,165,250,0.45) 0%, transparent 55%), radial-gradient(circle at 85% 110%, rgba(129,140,248,0.42) 0%, transparent 50%)",
                  }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 bottom-[-30px] size-48 rounded-full opacity-30"
                  style={{
                    background:
                      "radial-gradient(closest-side, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 70%)",
                  }}
                />
                <div className="relative">
                  <h2 className="font-[--font-display] text-[22px] font-black leading-tight tracking-tight text-white">
                    {editingId ? `Editing ${form.name || "Plan"}` : "Create Plan"}
                  </h2>
                  <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-blue-100/80">
                    {editingId
                      ? "Update pricing, features, and billing cycle."
                      : "Build a new subscription plan for your doctors"}
                  </p>
                </div>
              </div>

              <form className="space-y-4 p-6" onSubmit={(event) => void savePlan(event)}>
                <Field label="Plan name">
                  <div className="relative">
                    <UserPlus
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400"
                      strokeWidth={2.1}
                    />
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Professional"
                      required
                      className="!pl-11 !h-12 !rounded-2xl !bg-slate-50/80 !text-[14px]"
                    />
                  </div>
                </Field>

                <Field label="Price (USD)">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-bold text-slate-400">
                      $
                    </span>
                    <Input
                      type="number"
                      min="0.5"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      required
                      className="!pl-9 !h-12 !rounded-2xl !bg-slate-50/80 !text-[14px] !font-semibold"
                    />
                  </div>
                </Field>

                <Field label="Billing cycle">
                  <div className="relative">
                    <Calendar
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400"
                      strokeWidth={2.1}
                    />
                    <select
                      className="!h-12 w-full rounded-2xl border border-border bg-slate-50/80 pl-11 pr-4 text-[14px] font-semibold text-slate-700 shadow-sm outline-none transition-all focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100/80"
                      value={form.billingCycle}
                      onChange={(e) =>
                        setForm({ ...form, billingCycle: e.target.value as ApiBillingCycle })
                      }
                    >
                      <option value="MONTHLY">Monthly</option>
                      <option value="YEARLY">Yearly</option>
                    </select>
                  </div>
                </Field>

                <Field label="Trial days" hint="0 for no trial">
                  <div className="relative">
                    <Clock
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400"
                      strokeWidth={2.1}
                    />
                    <Input
                      type="number"
                      min="0"
                      max="90"
                      value={form.trialDays}
                      onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
                      className="!pl-11 !h-12 !rounded-2xl !bg-slate-50/80 !text-[14px] !font-semibold"
                    />
                  </div>
                </Field>

                <Field label="Description">
                  <div className="relative">
                    <FileText
                      className="pointer-events-none absolute left-3.5 top-3.5 size-4.5 text-slate-400"
                      strokeWidth={2.1}
                    />
                    <Input
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="For growing clinics"
                      className="!pl-11 !h-12 !rounded-2xl !bg-slate-50/80 !text-[14px]"
                    />
                  </div>
                </Field>

                <Field label="Features" hint="One per line">
                  <Textarea
                    rows={4}
                    value={form.features}
                    onChange={(e) => setForm({ ...form, features: e.target.value })}
                    className="!rounded-2xl !border-slate-200 !bg-slate-50/80 !text-[13.5px] !shadow-none focus:!border-blue-400 focus:!bg-white focus:!ring-4 focus:!ring-blue-100/80"
                  />
                </Field>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="group inline-flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-3.5 text-[14px] font-bold text-white shadow-[0_14px_32px_-10px_rgba(37,99,235,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_40px_-12px_rgba(37,99,235,0.8)] disabled:opacity-60 disabled:hover:translate-y-0"
                    style={{
                      background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 60%, #1E3A8A 100%)",
                    }}
                  >
                    <Plus className="size-4.5" strokeWidth={2.6} />
                    {saving ? "Saving…" : editingId ? "Update Plan" : "Create a Plan"}
                  </button>
                  {editingId ? (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="mt-2.5 w-full rounded-2xl py-2.5 text-[13px] font-semibold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                      Cancel editing
                    </button>
                  ) : null}
                </div>
              </form>
            </div>
          </div>
        </div>
    </>
  );
}
