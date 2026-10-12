import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Stethoscope } from "lucide-react";

const PLUS_PATTERN = `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.045'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`;

export function AuthLayout({
  title,
  children,
  footer,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "default" | "signup" | "onboarding";
}) {
  return (
    <div
      className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-5 py-12 sm:px-8 sm:py-14 lg:px-12 lg:py-16"
      style={{
        background: "linear-gradient(135deg, #081A56 0%, #0C2889 45%, #1033A6 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ backgroundImage: PLUS_PATTERN }}
      />

      <div
        className="relative z-10 grid w-full max-w-[860px] overflow-hidden rounded-[24px] bg-white lg:grid-cols-[0.92fr_1.08fr] lg:gap-6"
        style={{
          boxShadow:
            "0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 28px 56px -24px rgba(15, 23, 42, 0.42)",
        }}
      >
        <aside className="relative hidden min-h-[480px] overflow-visible bg-[#F7FAFF] px-5 pb-5 pt-6 lg:flex lg:flex-col lg:pr-2 xl:px-6 xl:pb-6 xl:pt-7 xl:pr-3">
          <h2
            className="relative z-20 shrink-0 text-left font-jakarta text-[clamp(1.15rem,1.5vw,1.35rem)] font-extrabold leading-tight tracking-tight text-slate-900"
            style={{ letterSpacing: "-0.03em" }}
          >
            Smart Healthcare Starts Here
          </h2>
          <div className="relative mt-3 flex w-full flex-1 items-center justify-center">
            <img
              src="/images/Doctor%20(1).png"
              alt="Doctor with AI receptionist"
              className="h-full w-auto max-h-full max-w-full select-none object-contain"
              loading="eager"
              draggable={false}
            />
          </div>
        </aside>

        <section className="flex flex-col justify-center px-5 py-6 sm:px-7 sm:py-7 lg:pl-4 lg:pr-8 xl:pl-5 xl:pr-9">
          <Link to="/" className="mb-5 inline-flex items-center gap-2.5 group self-start">
            <div
              className="grid size-9 place-items-center rounded-xl text-white transition-transform duration-300 group-hover:scale-105"
              style={{
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 55%, #1D4ED8 100%)",
                boxShadow: "0 8px 20px -8px rgba(37, 99, 235, 0.65)",
              }}
            >
              <Stethoscope className="size-4.5" strokeWidth={2.3} />
            </div>
            <div className="leading-tight">
              <p
                className="font-sans text-[14px] font-extrabold tracking-tight text-slate-900"
                style={{ letterSpacing: "-0.015em" }}
              >
                AI Receptionist
              </p>
            </div>
          </Link>

          <h1
            className="font-jakarta font-bold tracking-tight text-slate-900 text-balance"
            style={{
              fontSize: "clamp(1.35rem, 2vw, 1.55rem)",
              letterSpacing: "-0.025em",
            }}
          >
            {title}
          </h1>

          <div className="mt-4">{children}</div>

          {footer ? (
            <div className="mt-4 text-center text-[13px] text-slate-500">{footer}</div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
