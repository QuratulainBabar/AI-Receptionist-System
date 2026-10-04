import { Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import { ChevronDown, User } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge, Button, SectionLabel } from "@/components/ui/primitives";
import { clearSession, type Session } from "@/lib/session";

export type NavItem = { to: string; label: string; group: string };

export function AppShell({
  brandSuffix,
  nav,
  session,
  children,
}: {
  brandSuffix: string;
  nav: NavItem[];
  session: Session;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const groups = Array.from(new Set(nav.map((item) => item.group)));

  const accountLinks =
    session.role === "patient"
      ? [
          { to: "/patient/history", label: "Medical history" },
          { to: "/patient/records", label: "Reports & records" },
          { to: "/patient/activity", label: "Activity history" },
        ]
      : session.role === "doctor"
        ? [
            { to: "/doctor/patients", label: "Patient list" },
            { to: "/doctor/records", label: "History & reports" },
            { to: "/doctor/activity", label: "Activity history" },
          ]
        : [
            { to: "/admin/doctors", label: "Manage doctors" },
            { to: "/admin/patients", label: "Manage patients" },
          ];

  function signOut() {
    const loginPath = session.role === "admin" ? "/admin/login" : "/";
    clearSession();
    setAccountOpen(false);
    void navigate({ to: loginPath });
  }

  useEffect(() => {
    if (!accountOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) {
        setAccountOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar/90 backdrop-blur-md transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid size-9 place-items-center rounded-xl bg-primary font-display text-sm font-semibold text-primary-foreground">
            AR
          </div>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-semibold">AI Receptionist</p>
            <p className="label-mono">{brandSuffix}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <div key={group} className="mb-3">
              <SectionLabel className="px-3 pb-1.5">{group}</SectionLabel>
              <div className="space-y-0.5">
                {nav
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <Link
                      key={item.to}
                      {...({ to: item.to } as LinkProps)}
                      onClick={() => setOpen(false)}
                      activeOptions={{ exact: item.label === "Dashboard" }}
                      activeProps={{ className: "bg-primary text-primary-foreground shadow-sm" }}
                      inactiveProps={{ className: "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" }}
                      className="block rounded-xl px-3 py-2 text-[13px] font-medium transition-colors"
                    >
                      {item.label}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {open ? (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/30 lg:hidden"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-border/70 bg-card/70 px-4 py-2 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setOpen(true)}>
              Menu
            </Button>
            <Badge tone="primary">
              {session.role === "patient" ? "Patient area" : session.role === "doctor" ? "Doctor area" : "Admin area"}
            </Badge>
          </div>

          <div className="relative" ref={accountRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((value) => !value)}
              className="flex items-center gap-2.5 rounded-2xl bg-secondary px-2.5 py-1.5 text-left transition-colors hover:bg-secondary/80"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-border">
                <User className="size-4" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-foreground">{session.name}</span>
              </span>
              <ChevronDown
                className={cn("size-4 shrink-0 text-muted-foreground transition-transform", accountOpen && "rotate-180")}
                aria-hidden
              />
            </button>

            {accountOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-primary/35 bg-card shadow-panel"
              >
                <div className="border-b border-border px-3.5 py-2.5">
                  <SectionLabel>My account</SectionLabel>
                  <p className="mt-1 truncate text-[12px] text-muted-foreground">{session.email}</p>
                </div>
                <div className="border-b border-border py-1">
                  {accountLinks.map((item) => (
                    <Link
                      key={item.to}
                      {...({ to: item.to } as LinkProps)}
                      role="menuitem"
                      onClick={() => setAccountOpen(false)}
                      className="block px-3.5 py-2 text-[13px] text-foreground transition-colors hover:bg-secondary"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={signOut}
                  className="w-full px-3.5 py-2.5 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/8"
                >
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
