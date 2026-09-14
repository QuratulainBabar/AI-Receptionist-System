import { Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Avatar, Badge, Button, SectionLabel } from "@/components/ui/primitives";
import { clearSession, type Session } from "@/lib/session";

export type NavItem = { to: LinkProps["to"]; label: string; group: string };

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
  const groups = Array.from(new Set(nav.map((item) => item.group)));

  function signOut() {
    clearSession();
    void navigate({ to: "/" });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary font-display text-sm font-semibold text-primary-foreground">
            AR
          </div>
          <div className="leading-tight">
            <p className="font-display text-[15px] font-semibold">AI Receptionist</p>
            <p className="label-mono">{brandSuffix}</p>
          </div>
        </div>

        <div className="mx-4 mb-3 rounded-lg bg-sidebar-accent px-3 py-2.5">
          <SectionLabel>Signed in</SectionLabel>
          <p className="mt-0.5 text-[13px] font-medium text-sidebar-accent-foreground">{session.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {session.role === "patient" ? "Patient" : "Doctor"} · {session.reference}
          </p>
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
                      key={item.to as string}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      activeOptions={{ exact: item.label === "Dashboard" }}
                      activeProps={{ className: "bg-primary text-primary-foreground" }}
                      inactiveProps={{ className: "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" }}
                      className="block rounded-md px-3 py-2 text-[13px] font-medium transition-colors"
                    >
                      {item.label}
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5">
            <Avatar label={session.initials} className="size-9" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium">{session.name}</p>
              <p className="font-mono text-[10px] text-muted-foreground">{session.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>

      {open ? (
        <button
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-foreground/30 lg:hidden"
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setOpen(true)}>
              Menu
            </Button>
            <Badge tone="primary">{session.role === "patient" ? "Patient area" : "Doctor area"}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="accent">Demo data</Badge>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
