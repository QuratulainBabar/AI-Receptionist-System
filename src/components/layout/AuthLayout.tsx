import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

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
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-primary-foreground/15 font-display text-sm font-semibold">
            AR
          </div>
          <p className="font-display text-[15px] font-semibold">AI Receptionist</p>
        </div>
        <div className="max-w-sm">
          <h2 className="font-display text-3xl font-semibold text-primary-foreground">
            A front desk that never closes.
          </h2>
          <p className="mt-3 text-sm text-primary-foreground/80">
            Patients ask about specialities, find the right doctor and book a visit in one conversation.
            Doctors see the schedule, patient history and reports in one place.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-primary-foreground/80">
            <li>Speciality guidance and doctor matching</li>
            <li>Live slot availability and confirmations</li>
            <li>Medical history and report handover</li>
          </ul>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary-foreground/60">
          Interface preview · demo data only
        </p>
      </aside>

      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="grid size-8 place-items-center rounded-xl bg-primary font-display text-xs font-semibold text-primary-foreground">
              AR
            </div>
            <span className="font-display text-sm font-semibold">AI Receptionist</span>
          </Link>
          {eyebrow ? <p className="label-mono">{eyebrow}</p> : null}
          <h1 className={eyebrow ? "mt-1.5 text-2xl font-semibold" : "text-2xl font-semibold"}>{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
