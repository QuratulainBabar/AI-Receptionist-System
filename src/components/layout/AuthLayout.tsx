import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Stethoscope } from "lucide-react";

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "signup" | "onboarding";
}) {
  return (
    <div className="grid min-h-dvh w-full bg-[#f5f8fd] lg:h-dvh lg:min-h-0 lg:grid-cols-[1.08fr_0.92fr] lg:overflow-hidden">
      <aside
        className="relative hidden lg:flex flex-col overflow-hidden text-white"
        style={{
          background: "linear-gradient(135deg, #081A56 0%, #0C2889 45%, #1033A6 100%)",
        }}
      >
        <div
          className="absolute inset-0 pointer-events-none opacity-40"
          style={{
            backgroundImage: `
            url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.045'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")
          `,
          }}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 55% 60% at 78% 35%, rgba(59, 130, 246, 0.45) 0%, transparent 60%), radial-gradient(ellipse 50% 55% at 20% 85%, rgba(99, 102, 241, 0.35) 0%, transparent 60%)",
          }}
        />
        <div
          className="absolute right-0 top-[12%] w-[58%] h-[72%] pointer-events-none opacity-70"
          style={{
            background:
              "radial-gradient(ellipse 65% 55% at 60% 40%, rgba(59, 130, 246, 0.22) 0%, transparent 70%)",
            filter: "blur(8px)",
          }}
        />

        <div className="relative z-10 flex h-full flex-col px-8 py-5 xl:px-11">
          <Link to="/" className="inline-flex shrink-0 items-center gap-3.5 group">
            <div
              className="grid place-items-center size-11 rounded-2xl text-white transition-transform duration-300 group-hover:scale-105"
              style={{
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 55%, #1D4ED8 100%)",
                boxShadow:
                  "0 10px 30px -8px rgba(59, 130, 246, 0.75), 0 4px 12px -4px rgba(59, 130, 246, 0.35)",
              }}
            >
              <Stethoscope className="size-5" strokeWidth={2.3} />
            </div>
            <div className="leading-tight">
              <p
                className="font-[--font-display] font-extrabold tracking-tight text-white text-[16px]"
                style={{ letterSpacing: "-0.015em" }}
              >
                AI Receptionist
              </p>
              <p
                className="font-bold uppercase tracking-[0.22em] mt-0.5 text-[9px]"
                style={{ color: "rgba(147, 197, 253, 0.78)" }}
              >
                Premium Healthcare Platform
              </p>
            </div>
          </Link>

          <div className="relative mt-3 hidden min-h-0 flex-1">
            <img
              src="/images/auth 3.png"
              alt="AI Receptionist scheduling appointments"
              className="pointer-events-none absolute inset-0 h-full w-full object-contain object-right object-bottom select-none"
              style={{
                filter: "drop-shadow(0 40px 70px -22px rgba(15, 23, 42, 0.55))",
              }}
              loading="eager"
              draggable={false}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col justify-center">
          <div className="relative z-10 flex max-w-lg shrink-0 flex-col">
              <h2
                className="font-jakarta text-balance text-[clamp(2rem,3vw,3rem)] font-black leading-[1.02] tracking-tight text-white"
                style={{ letterSpacing: "-0.035em" }}
              >
                The right care,
                <br />
                <span className="text-white">right on time.</span>
              </h2>
              <p
                className="mt-3 max-w-md text-[0.95rem] font-medium leading-snug xl:text-[1.02rem]"
                style={{ color: "rgba(191, 219, 254, 0.95)" }}
              >
                Streamline your clinic with AI-powered reception and smart scheduling.
              </p>

              <div className="mt-10 flex items-center gap-3">
                <div className="flex -space-x-2.5">
                  {[
                    { c: "#2563EB", i: "DR" },
                    { c: "#F59E0B", i: "SJ" },
                  ].map((item) => (
                    <div
                      key={item.i}
                      className="grid size-8 place-items-center rounded-full text-[9px] font-bold text-white ring-2"
                      style={
                        {
                          background: `linear-gradient(135deg, ${item.c}, ${item.c}dd)`,
                          "--tw-ring-color": "rgba(12, 40, 137, 0.9)",
                        } as React.CSSProperties
                      }
                    >
                      {item.i}
                    </div>
                  ))}
                </div>
                <p className="text-[13px] font-semibold" style={{ color: "rgba(191, 219, 254, 0.95)" }}>
                  Trusted by <span className="font-extrabold text-white">2,500+ clinics worldwide</span>
                </p>
              </div>
          </div>
          </div>
        </div>
      </aside>

      <main className="relative flex items-start justify-center overflow-y-auto px-5 pb-5 pt-4 sm:px-8 lg:h-full lg:px-8 lg:pb-4 lg:pt-5 xl:px-12">
        <div className="w-full max-w-[430px]">
          <Link to="/" className="mb-4 flex items-center gap-3 lg:hidden group">
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

          {eyebrow ? <p className="label-mono text-blue-600/80 mb-1">{eyebrow}</p> : null}
          <h1
            className="font-jakarta font-bold tracking-tight text-foreground text-balance"
            style={{
              fontSize: "clamp(1.65rem, 2.6vw, 2rem)",
              letterSpacing: "-0.025em",
            }}
          >
            {title}
          </h1>
          <p
            className="mt-1 text-[14px] leading-snug text-muted-foreground"
            style={{ color: "#64748B" }}
          >
            {description}
          </p>

          <div
            className="mt-3 rounded-3xl p-4 sm:p-5"
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
              className="mt-3 text-center text-[13.5px] text-muted-foreground"
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
