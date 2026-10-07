import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Stethoscope,
  CheckCircle2,
  Shield,
  Clock,
  HeartPulse,
  PhoneCall,
  Users,
} from "lucide-react";

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
  variant = "default",
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "signup" | "onboarding";
}) {
  const heroFeatures = [
    {
      icon: <Clock className="size-5" strokeWidth={2.2} />,
      title: "24/7 AI Receptionist",
      desc: "Never miss a patient call, day or night",
    },
    {
      icon: <Stethoscope className="size-5" strokeWidth={2.2} />,
      title: "Smart Doctor Matching",
      desc: "Patients find the right specialist instantly",
    },
    {
      icon: <Shield className="size-5" strokeWidth={2.2} />,
      title: "Secure & Compliant",
      desc: "HIPAA-grade encryption for all patient data",
    },
    {
      icon: <PhoneCall className="size-5" strokeWidth={2.2} />,
      title: "Voice-Powered Booking",
      desc: "Book appointments by phone automatically",
    },
  ];

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_1fr] w-full">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden auth-pattern text-white">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
            url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")
          `,
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              radial-gradient(circle at 85% 15%, rgba(59, 130, 246, 0.35) 0%, transparent 45%),
              radial-gradient(circle at 10% 90%, rgba(139, 92, 246, 0.28) 0%, transparent 48%)
            `,
          }}
        />

        <div className="relative z-10 px-10 pt-10">
          <Link to="/" className="inline-flex items-center gap-3.5 group">
            <div
              className="grid size-12 place-items-center rounded-2xl text-white transition-transform duration-300 group-hover:scale-105"
              style={{
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 55%, #1D4ED8 100%)",
                boxShadow: "0 8px 24px -6px rgba(59, 130, 246, 0.7)",
              }}
            >
              <Stethoscope className="size-6" strokeWidth={2.3} />
            </div>
            <div className="leading-tight">
              <p className="font-[--font-display] text-[17px] font-extrabold tracking-tight text-white">
                AI Receptionist
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/80">
                Premium Healthcare Platform
              </p>
            </div>
          </Link>
        </div>

        <div className="relative z-10 flex-1 flex flex-col justify-center px-10 max-w-xl">
          <div className="flex items-center gap-3 mb-7">
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11.5px] font-bold uppercase tracking-[0.14em]"
              style={{
                background: "rgba(255,255,255,0.09)",
                border: "1px solid rgba(255,255,255,0.15)",
                backdropFilter: "blur(8px)",
                color: "#93C5FD",
              }}
            >
              <HeartPulse className="size-4" strokeWidth={2.4} />
              Smarter Healthcare · Better Care
            </span>
          </div>

          <h2
            className="font-[--font-display] text-[2.5rem] leading-[1.1] font-bold tracking-tight text-white text-balance"
            style={{ letterSpacing: "-0.03em" }}
          >
            A front desk that
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #93C5FD 0%, #A78BFA 60%, #C4B5FD 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {" "}
              never closes.
            </span>
          </h2>

          <p className="mt-6 text-[15px] leading-relaxed text-blue-100/80 max-w-md">
            Patients ask about specialties, find the right doctor and book a visit in one seamless
            conversation. Doctors see their schedule, patient history and reports — all in one
            elegant place.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 max-w-lg">
            {heroFeatures.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl p-4.5 transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backdropFilter: "blur(12px)",
                }}
              >
                <div
                  className="grid size-9 place-items-center rounded-xl mb-3"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(59, 130, 246, 0.35), rgba(139, 92, 246, 0.25))",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  {f.icon}
                </div>
                <p className="text-[13.5px] font-bold text-white">{f.title}</p>
                <p className="mt-1 text-[12px] text-blue-200/70 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 flex items-center gap-6">
            <div className="flex -space-x-3">
              {[
                { c: "#3B82F6", i: "DR" },
                { c: "#8B5CF6", i: "SJ" },
                { c: "#10B981", i: "AM" },
                { c: "#F59E0B", i: "MK" },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="grid size-10 place-items-center rounded-full text-[12px] font-bold text-white ring-2 ring-[#0E2358]"
                  style={{ background: `linear-gradient(135deg, ${item.c}, ${item.c}dd)` }}
                >
                  {item.i}
                </div>
              ))}
            </div>
            <div>
              <div className="flex items-center gap-1 text-[13.5px] font-bold text-white">
                <Users className="size-4 text-blue-300" strokeWidth={2.3} />
                2,500+ clinics onboard
              </div>
              <p className="mt-0.5 text-[12px] text-blue-200/70">Trusted by doctors worldwide</p>
            </div>
          </div>
        </div>

        <div className="relative z-10 px-10 pb-10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300/60">
            <span
              className="size-1.5 rounded-full"
              style={{
                backgroundColor: "#10B981",
                boxShadow: "0 0 0 4px rgba(16, 185, 129, 0.25)",
                animation: "pulseDot 2s ease-in-out infinite",
              }}
            />
            All systems operational
          </div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-blue-300/40">
            Production Ready · v2.0
          </p>
        </div>
      </aside>

      <main className="relative flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center gap-3 lg:hidden group">
            <div
              className="grid size-10 place-items-center rounded-xl text-white"
              style={{
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 55%, #1D4ED8 100%)",
                boxShadow: "0 6px 18px -6px rgba(59, 130, 246, 0.6)",
              }}
            >
              <Stethoscope className="size-5" strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <span className="font-[--font-display] text-[15px] font-extrabold tracking-tight">
                AI Receptionist
              </span>
            </div>
          </Link>

          {variant === "signup" ? (
            <div className="mb-7 flex items-center gap-3">
              {[1, 2, 3].map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className="grid size-9 place-items-center rounded-xl text-[12.5px] font-bold transition-all"
                    style={{
                      background:
                        i === 0
                          ? "linear-gradient(135deg, #2563EB, #1D4ED8)"
                          : "linear-gradient(135deg, #F1F5F9, #E2E8F0)",
                      color: i === 0 ? "#FFFFFF" : "#94A3B8",
                      boxShadow: i === 0 ? "0 4px 14px -4px rgba(37, 99, 235, 0.6)" : "none",
                    }}
                  >
                    {i === 0 ? <CheckCircle2 className="size-4.5" /> : step}
                  </div>
                  {step < 3 && (
                    <div
                      className="w-10 h-0.5 rounded-full"
                      style={{
                        background:
                          i === 0 ? "linear-gradient(90deg, #1D4ED8, #E2E8F0)" : "#E2E8F0",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {eyebrow ? <p className="label-mono text-blue-600/80 mb-1">{eyebrow}</p> : null}
          <h1
            className="font-[--font-display] font-bold tracking-tight text-foreground text-balance"
            style={{ fontSize: "clamp(1.8rem, 4vw, 2.25rem)", letterSpacing: "-0.025em" }}
          >
            {title}
          </h1>
          <p
            className="mt-2.5 text-[14.5px] leading-relaxed text-muted-foreground"
            style={{ color: "#64748B" }}
          >
            {description}
          </p>

          <div
            className="mt-8 rounded-3xl p-7"
            style={{
              background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
              border: "1px solid #EEF2F7",
              boxShadow:
                "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 24px 56px -24px rgba(15, 23, 42, 0.14)",
            }}
          >
            {children}
          </div>

          {footer ? (
            <div
              className="mt-7 text-center text-[13.5px] text-muted-foreground"
              style={{ color: "#64748B" }}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
