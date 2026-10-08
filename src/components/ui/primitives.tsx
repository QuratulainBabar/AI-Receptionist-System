import type {
  ReactNode,
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { useId } from "react";
import {
  Calendar,
  Users,
  Clock,
  FileText,
  Activity,
  Bell,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Stethoscope,
  Shield,
  Phone,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  DollarSign,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "outline" | "ghost" | "soft" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "text-white shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all duration-200 hover:-translate-y-0.5",
  outline:
    "border border-border bg-card text-foreground hover:bg-secondary hover:border-primary/30 transition-all duration-200",
  ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors",
  soft: "bg-secondary text-foreground hover:bg-secondary/70 transition-colors",
  danger: "border border-border bg-card text-destructive hover:bg-destructive/10 transition-colors",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-[12.5px]",
  md: "h-11 px-5 text-[13.5px]",
  lg: "h-12 px-6 text-[14px]",
};

function buttonBaseGradient() {
  return {
    background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 50%, #1E40AF 100%)",
  };
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  style,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const isPrimary = variant === "primary";
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      style={isPrimary ? { ...buttonBaseGradient(), ...style } : style}
      {...props}
    />
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn("panel p-6", className)}
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FEFEFF 100%)",
        border: "1px solid #EEF2F7",
        boxShadow: "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 8px 24px -14px rgba(15, 23, 42, 0.08)",
      }}
    >
      {children}
    </div>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("label-mono", className)} style={{ letterSpacing: "0.12em" }}>
      {children}
    </p>
  );
}

type BadgeTone = "primary" | "success" | "warning" | "destructive" | "muted" | "accent" | "info";

const badgeStyles: Record<BadgeTone, { bg: string; color: string; border?: string }> = {
  primary: {
    bg: "linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%)",
    color: "#1D4ED8",
    border: "1px solid rgba(59, 130, 246, 0.2)",
  },
  success: {
    bg: "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.08) 100%)",
    color: "#047857",
    border: "1px solid rgba(16, 185, 129, 0.2)",
  },
  warning: {
    bg: "linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(217, 119, 6, 0.09) 100%)",
    color: "#B45309",
    border: "1px solid rgba(245, 158, 11, 0.25)",
  },
  destructive: {
    bg: "linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(220, 38, 38, 0.08) 100%)",
    color: "#DC2626",
    border: "1px solid rgba(239, 68, 68, 0.2)",
  },
  muted: {
    bg: "linear-gradient(135deg, #F1F5F9 0%, #E2E8F0 100%)",
    color: "#475569",
    border: "1px solid #E2E8F0",
  },
  accent: {
    bg: "linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(124, 58, 237, 0.08) 100%)",
    color: "#6D28D9",
    border: "1px solid rgba(139, 92, 246, 0.2)",
  },
  info: {
    bg: "linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(2, 132, 199, 0.08) 100%)",
    color: "#0369A1",
    border: "1px solid rgba(14, 165, 233, 0.2)",
  },
};

export function Badge({
  tone = "muted",
  children,
  className,
  dot,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  const style = badgeStyles[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase",
        className,
      )}
      style={{
        background: style.bg,
        color: style.color,
        border: style.border,
      }}
    >
      {dot ? (
        <span className="size-1.5 rounded-full" style={{ backgroundColor: style.color }} />
      ) : null}
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[13px] font-semibold text-foreground flex items-center gap-1.5">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="block text-[12px] text-muted-foreground leading-relaxed">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-xl border-2 border-transparent bg-input-fill px-4 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 transition-all duration-200 focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:outline-none",
        className,
      )}
      style={{
        boxShadow: "inset 0 1px 2px 0 rgba(15, 23, 42, 0.03)",
      }}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border-2 border-transparent bg-input-fill p-4 text-[13.5px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 transition-all duration-200 focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Avatar({
  label,
  className,
  size = "md",
}: {
  label: string;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes: Record<string, string> = {
    sm: "size-9 text-[11.5px]",
    md: "size-11 text-[13px]",
    lg: "size-14 text-[16px]",
    xl: "size-18 text-[20px]",
  };
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl font-bold text-white",
        sizes[size],
        className,
      )}
      style={{
        background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)",
        boxShadow: "0 2px 8px -2px rgba(99, 102, 241, 0.4)",
      }}
    >
      {label}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? (
          <SectionLabel className="text-[11px] text-blue-600/80">{eyebrow}</SectionLabel>
        ) : null}
        <h1
          className="mt-1.5 font-[--font-display] font-bold tracking-tight text-foreground text-balance"
          style={{ fontSize: "clamp(1.5rem, 2.5vw, 2rem)" }}
        >
          {title}
        </h1>
        {description ? (
          <p
            className="mt-2.5 text-[14px] leading-relaxed text-muted-foreground max-w-2xl"
            style={{ color: "#5A6A85" }}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">{actions}</div>
      ) : null}
    </header>
  );
}

export type KpiIconVariant =
  | "appointments"
  | "patients"
  | "consultations"
  | "followups"
  | "reports"
  | "revenue"
  | "doctors"
  | "calls"
  | "bookings"
  | "subscriptions"
  | "alerts"
  | "activity"
  | "default";

const kpiIconConfig: Record<KpiIconVariant, { icon: ReactNode; bgClass: string }> = {
  appointments: {
    icon: <Calendar className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-blue",
  },
  patients: {
    icon: <Users className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-teal",
  },
  consultations: {
    icon: <Clock className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-violet",
  },
  followups: {
    icon: <Activity className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-amber",
  },
  reports: {
    icon: <FileText className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-blue",
  },
  revenue: {
    icon: <DollarSign className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-emerald",
  },
  doctors: {
    icon: <Stethoscope className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-blue",
  },
  calls: {
    icon: <Phone className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-teal",
  },
  bookings: {
    icon: <UserPlus className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-violet",
  },
  subscriptions: {
    icon: <CreditCard className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-emerald",
  },
  alerts: {
    icon: <Bell className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-rose",
  },
  activity: {
    icon: <BarChart3 className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-violet",
  },
  default: {
    icon: <Activity className="size-6" strokeWidth={2} />,
    bgClass: "kpi-icon-blue",
  },
};

export function StatCard({
  label,
  value,
  detail,
  icon = "default",
  trend,
  trendLabel,
  trendPositive,
  miniChart,
  miniChartColor,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: KpiIconVariant;
  trend?: string;
  trendLabel?: string;
  trendPositive?: boolean;
  miniChart?: number[];
  miniChartColor?: string;
}) {
  const iconCfg = kpiIconConfig[icon];
  const gradId = useId();
  const chartId = `kpi-chart-${gradId.replace(/:/g, "")}`;
  const hasExplicitChart =
    miniChart !== undefined || miniChartColor !== undefined || trend !== undefined;
  const chartColor =
    miniChartColor ||
    (hasExplicitChart ? (trendPositive === false ? "#F43F5E" : "#2563EB") : "#94A3B8");
  const chartPoints = miniChart || [20, 35, 28, 45, 38, 52, 60];

  const max = Math.max(...chartPoints);
  const min = Math.min(...chartPoints);
  const range = max - min || 1;
  const pathD = chartPoints
    .map((v, i) => {
      const x = (i / (chartPoints.length - 1)) * 100;
      const y = 100 - ((v - min) / range) * 80 - 10;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const areaD = pathD + ` L 100 100 L 0 100 Z`;

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_-12px_rgba(15,23,42,0.18)] group"
      style={{
        background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
        border: "1px solid #EEF2F7",
        boxShadow: "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 6px 18px -14px rgba(15, 23, 42, 0.1)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: "#64748B" }}>
            {label}
          </p>
          <p
            className="mt-2.5 font-[--font-display] font-bold tracking-tight text-foreground leading-none"
            style={{ fontSize: "clamp(1.6rem, 3vw, 2.1rem)" }}
          >
            {value}
          </p>
        </div>
        <div
          className={cn(
            "grid size-12 shrink-0 place-items-center rounded-2xl transition-transform duration-300 group-hover:scale-110",
            iconCfg.bgClass,
          )}
          style={{
            boxShadow: "0 4px 12px -4px rgba(15, 23, 42, 0.1)",
          }}
        >
          {iconCfg.icon}
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex-1 min-w-0">
          {trend !== undefined ? (
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold",
                  trendPositive === false ? "text-rose-600" : "text-emerald-600",
                )}
                style={{
                  background:
                    trendPositive === false
                      ? "linear-gradient(135deg, rgba(244, 63, 94, 0.1), rgba(244, 63, 94, 0.04))"
                      : "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.04))",
                }}
              >
                {trendPositive === false ? (
                  <TrendingDown className="size-3.5" strokeWidth={2.5} />
                ) : (
                  <TrendingUp className="size-3.5" strokeWidth={2.5} />
                )}
                {trend}
              </span>
              {trendLabel ? (
                <span className="text-[12px] text-muted-foreground">{trendLabel}</span>
              ) : null}
            </div>
          ) : detail ? (
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">{detail}</p>
          ) : null}
        </div>

        <div className="w-24 h-10 shrink-0">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-full overflow-visible"
          >
            <defs>
              <linearGradient id={chartId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColor} stopOpacity="0.35" />
                <stop offset="100%" stopColor={chartColor} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaD} fill={`url(#${chartId})`} transform="" />
            <path
              d={pathD}
              fill="none"
              stroke={chartColor}
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      </div>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-8 text-center text-sm"
      style={{
        background: "linear-gradient(180deg, #FAFBFC 0%, #F6F8FC 100%)",
        borderColor: "#E2E8F0",
        color: "#64748B",
      }}
    >
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-secondary/70">
        <Activity className="size-7 text-muted-foreground" strokeWidth={1.8} />
      </div>
      <div className="font-medium text-foreground">{children}</div>
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-5 mb-5 border-b border-[#F1F5F9]">
      <div className="flex items-start gap-3.5 min-w-0">
        {icon ? (
          <div
            className="grid size-10 shrink-0 place-items-center rounded-xl"
            style={{
              background:
                "linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(59, 130, 246, 0.05))",
              color: "#1D4ED8",
            }}
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="section-title text-[16px]">{title}</h3>
          {subtitle ? <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function TrendChip({
  value,
  positive,
  label,
}: {
  value: string;
  positive?: boolean;
  label?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-bold",
        positive === false ? "text-rose-600" : "text-emerald-600",
      )}
      style={{
        background:
          positive === false
            ? "linear-gradient(135deg, rgba(244, 63, 94, 0.1), rgba(244, 63, 94, 0.04))"
            : "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(16, 185, 129, 0.04))",
      }}
    >
      {positive === false ? (
        <TrendingDown className="size-3.5" strokeWidth={2.5} />
      ) : (
        <TrendingUp className="size-3.5" strokeWidth={2.5} />
      )}
      {value}
      {label ? <span className="opacity-70 ml-0.5">· {label}</span> : null}
    </span>
  );
}

export function AlertBox({
  tone = "info",
  children,
  title,
}: {
  tone?: "success" | "warning" | "info" | "error";
  children: ReactNode;
  title?: string;
}) {
  const styles = {
    success: {
      borderColor: "#10B981",
      bg: "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02))",
      icon: <CheckCircle2 className="size-5" strokeWidth={2.2} />,
      color: "#047857",
    },
    warning: {
      borderColor: "#F59E0B",
      bg: "linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.03))",
      icon: <AlertTriangle className="size-5" strokeWidth={2.2} />,
      color: "#B45309",
    },
    info: {
      borderColor: "#3B82F6",
      bg: "linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(59, 130, 246, 0.03))",
      icon: <Shield className="size-5" strokeWidth={2.2} />,
      color: "#1D4ED8",
    },
    error: {
      borderColor: "#EF4444",
      bg: "linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.03))",
      icon: <AlertTriangle className="size-5" strokeWidth={2.2} />,
      color: "#DC2626",
    },
  };
  const s = styles[tone];
  return (
    <div
      className="rounded-xl border-l-4 px-4 py-3.5"
      style={{ borderLeftColor: s.borderColor, background: s.bg }}
    >
      <div className="flex items-start gap-3">
        <span style={{ color: s.color }}>{s.icon}</span>
        <div className="flex-1 min-w-0">
          {title ? (
            <p className="text-[13px] font-bold mb-0.5" style={{ color: s.color }}>
              {title}
            </p>
          ) : null}
          <div className="text-[13px] leading-relaxed text-foreground/90">{children}</div>
        </div>
      </div>
    </div>
  );
}
