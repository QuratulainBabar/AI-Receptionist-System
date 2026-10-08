import { Link, useNavigate, type LinkProps } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronRight,
  Bell,
  MessageSquare,
  Search,
  Menu,
  Home,
  Calendar,
  Users,
  FileText,
  Clock,
  Settings,
  UserCircle,
  LogOut,
  Activity,
  Shield,
  Phone,
  CreditCard,
  Stethoscope,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import { doctorNotificationsApi, type ApiDoctorNotification } from "@/lib/api";
import { clearSession, type Session } from "@/lib/session";

export type NavItem = { to: string; label: string; group: string; icon?: string };

const ICON_MAP: Record<string, ReactNode> = {
  Dashboard: <Home className="size-[18px]" strokeWidth={2} />,
  Appointments: <Calendar className="size-[18px]" strokeWidth={2} />,
  Schedule: <Calendar className="size-[18px]" strokeWidth={2} />,
  Patients: <Users className="size-[18px]" strokeWidth={2} />,
  "Patient list": <Users className="size-[18px]" strokeWidth={2} />,
  "Patient List": <Users className="size-[18px]" strokeWidth={2} />,
  "History & Reports": <FileText className="size-[18px]" strokeWidth={2} />,
  "History & reports": <FileText className="size-[18px]" strokeWidth={2} />,
  Records: <FileText className="size-[18px]" strokeWidth={2} />,
  Availability: <Clock className="size-[18px]" strokeWidth={2} />,
  Notifications: <Bell className="size-[18px]" strokeWidth={2} />,
  Profile: <UserCircle className="size-[18px]" strokeWidth={2} />,
  "My profile": <UserCircle className="size-[18px]" strokeWidth={2} />,
  Settings: <Settings className="size-[18px]" strokeWidth={2} />,
  "Activity history": <Activity className="size-[18px]" strokeWidth={2} />,
  "Activity History": <Activity className="size-[18px]" strokeWidth={2} />,
  Activity: <Activity className="size-[18px]" strokeWidth={2} />,
  Synthflow: <Phone className="size-[18px]" strokeWidth={2} />,
  "Voice calls": <Phone className="size-[18px]" strokeWidth={2} />,
  Doctors: <Stethoscope className="size-[18px]" strokeWidth={2} />,
  Subscriptions: <CreditCard className="size-[18px]" strokeWidth={2} />,
  "Medical history": <FileText className="size-[18px]" strokeWidth={2} />,
  "Reports & records": <FileText className="size-[18px]" strokeWidth={2} />,
  "Manage doctors": <Stethoscope className="size-[18px]" strokeWidth={2} />,
  "Manage patients": <Users className="size-[18px]" strokeWidth={2} />,
  Subscription: <CreditCard className="size-[18px]" strokeWidth={2} />,
  Billing: <CreditCard className="size-[18px]" strokeWidth={2} />,
  Overview: <Shield className="size-[18px]" strokeWidth={2} />,
};

function getIcon(label: string): ReactNode {
  return ICON_MAP[label] || <Activity className="size-[18px]" strokeWidth={2} />;
}

export function AppShell({
  brandSuffix,
  nav,
  session,
  accountMenu,
  children,
}: {
  brandSuffix: string;
  nav: NavItem[];
  session: Session;
  accountMenu?: { to: string; label: string }[];
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApiDoctorNotification[]>([]);
  const accountRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const groups = Array.from(new Set(nav.map((item) => item.group)));

  const accountLinks =
    accountMenu ??
    (session.role === "patient"
      ? [
          { to: "/patient/history", label: "Medical history" },
          { to: "/patient/records", label: "Reports & records" },
          { to: "/patient/activity", label: "Activity history" },
        ]
      : session.role === "doctor"
        ? [
            { to: "/doctor/patients", label: "Patient List" },
            { to: "/doctor/records", label: "Reports" },
            { to: "/doctor/activity", label: "Activity History" },
          ]
        : []);

  function signOut() {
    const loginPath = "/";
    clearSession();
    setAccountOpen(false);
    void navigate({ to: loginPath });
  }

  useEffect(() => {
    if (!accountOpen && !notificationOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (accountOpen && accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountOpen(false);
      }
      if (
        notificationOpen &&
        notifRef.current &&
        !notifRef.current.contains(event.target as Node)
      ) {
        setNotificationOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setNotificationOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen, notificationOpen]);

  useEffect(() => {
    if (session.role !== "doctor") return;
    let cancelled = false;

    async function loadNotifications() {
      try {
        const result = await doctorNotificationsApi.list();
        if (!cancelled) setNotifications(result.notifications);
      } catch {
        // Keep the last known list if a refresh fails.
      }
    }

    void loadNotifications();
    const timer = window.setInterval(() => {
      void loadNotifications();
    }, 30_000);
    window.addEventListener("focus", loadNotifications);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", loadNotifications);
    };
  }, [session.role]);

  const notificationsCount = session.role === "doctor" ? notifications.length : 0;
  const notificationBadge = notificationsCount > 99 ? "99+" : String(notificationsCount);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-dvh w-[268px] shrink-0 flex-col transition-transform duration-300 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          background: "linear-gradient(180deg, #0B1E4B 0%, #0E2358 45%, #0F2556 100%)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "4px 0 24px -8px rgba(11, 30, 75, 0.3)",
        }}
      >
        <div className="relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-40 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle at 80% 0%, rgba(59, 130, 246, 0.25) 0%, transparent 55%), radial-gradient(circle at 0% 100%, rgba(139, 92, 246, 0.18) 0%, transparent 50%)",
            }}
          />
          <div className="relative flex items-center gap-3 px-6 py-5">
            <div
              className="grid size-11 shrink-0 place-items-center rounded-2xl text-white"
              style={{
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)",
                boxShadow: "0 6px 20px -6px rgba(59, 130, 246, 0.6)",
              }}
            >
              <Stethoscope className="size-5.5" strokeWidth={2.2} />
            </div>
            <div className="leading-tight">
              <p className="font-[--font-display] text-[15.5px] font-bold text-white tracking-tight">
                AI Receptionist
              </p>
              {brandSuffix ? (
                <p className="text-[11px] font-medium text-[#60A5FA]/80 mt-0.5 uppercase tracking-[0.14em]">
                  {brandSuffix}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 pb-5 sidebar-scroll scroll-clip">
          {groups.map((group) => (
            <div key={group} className="mb-1 first:mt-1.5">
              <div className="space-y-1">
                {nav
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <Link
                      key={item.to}
                      {...({ to: item.to } as LinkProps)}
                      onClick={() => setOpen(false)}
                      activeOptions={{ exact: item.label === "Dashboard" }}
                      activeProps={{ className: "sidebar-link-active" }}
                      inactiveProps={{ className: "sidebar-link-hover" }}
                      className="sidebar-link group"
                    >
                      <span className="grid size-[30px] shrink-0 place-items-center rounded-lg">
                        {getIcon(item.label)}
                      </span>
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.label === "Notifications" && notificationsCount > 0 ? (
                        <span
                          className="grid min-w-[20px] h-5 px-1.5 place-items-center rounded-full text-[10.5px] font-bold text-white"
                          style={{
                            background: "linear-gradient(135deg, #EF4444 0%, #F43F5E 100%)",
                            boxShadow: "0 2px 8px -2px rgba(239, 68, 68, 0.6)",
                          }}
                        >
                          {notificationBadge}
                        </span>
                      ) : null}
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
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="glass-header z-20 flex min-h-[72px] shrink-0 items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              className="grid size-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" strokeWidth={2} />
            </button>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            {session.role === "patient" ? (
              <div className="relative hidden md:block w-[420px] max-w-[45vw]">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                  strokeWidth={2}
                />
                <input
                  type="text"
                  placeholder="Search patients, appointments..."
                  className="h-11 w-full rounded-2xl border border-border/70 bg-card/60 pl-11 pr-20 text-sm text-foreground placeholder:text-muted-foreground/70 transition-all focus:border-primary/30 focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/10 shadow-sm"
                />
                <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex h-6 items-center gap-0.5 rounded-lg border border-border/70 bg-muted px-1.5 font-mono text-[10.5px] font-semibold text-muted-foreground">
                  <span>⌘</span>
                  <span>K</span>
                </kbd>
              </div>
            ) : null}

            <div ref={notifRef} className="relative">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={notificationOpen}
                onClick={() => setNotificationOpen((v) => !v)}
                className="relative grid size-11 shrink-0 place-items-center rounded-2xl border border-border/70 bg-card/60 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground hover:shadow-sm"
              >
                <Bell className="size-[19px]" strokeWidth={2} />
                {notificationsCount > 0 ? (
                  <span
                    className="absolute top-2 right-2 grid min-w-[18px] h-4.5 px-1 place-items-center rounded-full text-[10px] font-bold text-white"
                    style={{
                      background: "linear-gradient(135deg, #EF4444 0%, #F43F5E 100%)",
                      boxShadow: "0 2px 6px -1px rgba(239, 68, 68, 0.55)",
                    }}
                  >
                    {notificationBadge}
                  </span>
                ) : null}
              </button>
              {notificationOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
                >
                  <div className="border-b border-border px-5 py-4">
                    <h4 className="section-title text-[15px]">Notifications</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Latest activity in your clinic
                    </p>
                  </div>
                  <div className="max-h-80 overflow-y-auto scrollbar-thin">
                    {notifications.length === 0 ? (
                      <p className="px-5 py-6 text-sm text-muted-foreground">
                        No notifications yet.
                      </p>
                    ) : (
                      notifications.slice(0, 6).map((note) => (
                        <div
                          key={note.id}
                          className="flex gap-3 border-b border-border/60 px-5 py-3.5 transition-colors hover:bg-muted/40 last:border-b-0"
                        >
                          <span
                            className="mt-1.5 size-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor:
                                note.kind === "cancelled"
                                  ? "#EF4444"
                                  : note.kind === "changed"
                                    ? "#F59E0B"
                                    : "#3B82F6",
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-foreground truncate">
                              {note.title}
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground truncate">
                              {note.detail}
                            </p>
                            <p className="mt-1 font-mono text-[10.5px] text-muted-foreground/80">
                              {note.time}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {session.role === "doctor" ? (
                    <div className="border-t border-border px-5 py-3 bg-muted/30">
                      <Link
                        to="/doctor/notifications"
                        onClick={() => setNotificationOpen(false)}
                        className="block"
                      >
                        <Button variant="soft" size="sm" className="w-full rounded-xl">
                          View all notifications
                        </Button>
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {session.role === "patient" ? (
              <button
                type="button"
                className="relative hidden sm:grid size-11 shrink-0 place-items-center rounded-2xl border border-border/70 bg-card/60 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground hover:shadow-sm"
              >
                <MessageSquare className="size-[19px]" strokeWidth={2} />
              </button>
            ) : null}

            <div className="relative" ref={accountRef}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen((value) => !value)}
                className="flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card/60 pl-1.5 pr-3 py-1.5 text-left transition-all hover:bg-secondary hover:shadow-sm"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-xl font-semibold text-white text-[12px]"
                  style={{
                    background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%)",
                    boxShadow: "0 2px 8px -2px rgba(99, 102, 241, 0.45)",
                  }}
                >
                  {session.name
                    .replace(/^Dr\.\s+/i, "")
                    .split(" ")
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <span className="hidden md:block min-w-0 leading-tight">
                  <span className="block truncate text-[13px] font-semibold text-foreground">
                    {session.name}
                  </span>
                  {session.role !== "admin" ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {session.role === "doctor" ? "General Physician" : "Patient"}
                    </span>
                  ) : null}
                </span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform",
                    accountOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>

              {accountOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
                >
                  <div className="border-b border-border p-5 bg-muted/20">
                    <div className="flex items-center gap-3.5">
                      <span
                        className="grid size-12 shrink-0 place-items-center rounded-2xl font-bold text-white"
                        style={{
                          background: "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
                        }}
                      >
                        {session.name
                          .replace(/^Dr\.\s+/i, "")
                          .split(" ")
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="truncate text-[14px] font-bold text-foreground">
                          {session.name}
                        </p>
                        <p className="truncate text-[12px] text-muted-foreground mt-0.5">
                          {session.email}
                        </p>
                      </div>
                    </div>
                  </div>
                  {accountLinks.length > 0 ? (
                  <div className="border-b border-border py-1.5">
                    {accountLinks.map((item) => (
                      <Link
                        key={item.to}
                        {...({ to: item.to } as LinkProps)}
                        role="menuitem"
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-3 mx-1.5 my-0.5 px-3.5 py-2.5 rounded-xl text-[13px] font-medium text-foreground transition-colors hover:bg-secondary"
                      >
                        <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                          {getIcon(item.label)}
                        </span>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={signOut}
                    className="flex items-center gap-3 mx-1.5 my-1.5 w-[calc(100%-12px)] px-3.5 py-3 rounded-xl text-left text-[13px] font-semibold text-destructive transition-colors hover:bg-destructive/8"
                  >
                    <span className="grid size-8 place-items-center rounded-lg bg-destructive/10 text-destructive">
                      <LogOut className="size-4.5" strokeWidth={2} />
                    </span>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin">
          <div className="mx-auto w-full max-w-[1480px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
