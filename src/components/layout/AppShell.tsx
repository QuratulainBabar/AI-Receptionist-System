import { Link, useNavigate, useRouterState, type LinkProps } from "@tanstack/react-router";
import {
  ChevronDown,
  ChevronLeft,
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
  Wallet,
  Stethoscope,
  ClipboardList,
  Sparkles,
  Hourglass,
  CheckCircle2,
  CircleCheck,
  Ban,
  RefreshCw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import {
  DOCTOR_NOTIFICATIONS_UPDATED_EVENT,
  doctorNotificationsApi,
  doctorProfileApi,
  type ApiDoctorNotification,
} from "@/lib/api";
import { clearSession, type Session } from "@/lib/session";

const SIDEBAR_COLLAPSED_KEY = "ai-receptionist-sidebar-collapsed";

export type NavChild = { to: string; label: string };

export type NavItem = {
  to: string;
  label: string;
  group: string;
  icon?: string;
  /** When set, parent toggles submenu only — it does not navigate. */
  children?: NavChild[];
};

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
  "My Clinic": <Phone className="size-[18px]" strokeWidth={2} />,
  "Voice calls": <Phone className="size-[18px]" strokeWidth={2} />,
  Doctors: <Stethoscope className="size-[18px]" strokeWidth={2} />,
  Subscriptions: <CreditCard className="size-[18px]" strokeWidth={2} />,
  Earnings: <Wallet className="size-[18px]" strokeWidth={2} />,
  "Medical history": <FileText className="size-[18px]" strokeWidth={2} />,
  "Reports & records": <FileText className="size-[18px]" strokeWidth={2} />,
  "Manage doctors": <Stethoscope className="size-[18px]" strokeWidth={2} />,
  "Manage patients": <Users className="size-[18px]" strokeWidth={2} />,
  Subscription: <CreditCard className="size-[18px]" strokeWidth={2} />,
  Plans: <CreditCard className="size-[18px]" strokeWidth={2} />,
  Billing: <CreditCard className="size-[18px]" strokeWidth={2} />,
  Overview: <Shield className="size-[18px]" strokeWidth={2} />,
  Users: <Users className="size-[18px]" strokeWidth={2} />,
  "Team Members": <Users className="size-[18px]" strokeWidth={2} />,
  "Team members": <Users className="size-[18px]" strokeWidth={2} />,
};

function getIcon(label: string): ReactNode {
  return ICON_MAP[label] || <Activity className="size-[18px]" strokeWidth={2} />;
}

const SUBNAV_ICON_MAP: Record<string, ReactNode> = {
  "All Appointments": <ClipboardList className="size-[15px]" strokeWidth={2} />,
  New: <Sparkles className="size-[15px]" strokeWidth={2} />,
  Pending: <Hourglass className="size-[15px]" strokeWidth={2} />,
  Confirmed: <CheckCircle2 className="size-[15px]" strokeWidth={2} />,
  Completed: <CircleCheck className="size-[15px]" strokeWidth={2} />,
  Cancelled: <Ban className="size-[15px]" strokeWidth={2} />,
  "Follow-Up Appointments": <RefreshCw className="size-[15px]" strokeWidth={2} />,
  "Team members": <Users className="size-[15px]" strokeWidth={2} />,
};

function getSubnavIcon(label: string): ReactNode {
  return SUBNAV_ICON_MAP[label] || <ChevronRight className="size-[14px]" strokeWidth={2} />;
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApiDoctorNotification[]>([]);
  const [expandedNav, setExpandedNav] = useState<Record<string, boolean>>({});
  const accountRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const [doctorSpecialty, setDoctorSpecialty] = useState("");
  const groups = Array.from(new Set(nav.map((item) => item.group)));

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setOpen(false);
    setAccountOpen(false);
    setNotificationOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const autoExpanded = useMemo(() => {
    const next: Record<string, boolean> = {};
    for (const item of nav) {
      if (!item.children?.length) continue;
      const childActive = item.children.some((child) => {
        const base = child.to.replace(/\/$/, "");
        return pathname === child.to || pathname === base || pathname.startsWith(`${base}/`);
      });
      if (childActive) next[item.label] = true;
    }
    return next;
  }, [nav, pathname]);

  useEffect(() => {
    setExpandedNav((current) => ({ ...current, ...autoExpanded }));
  }, [autoExpanded]);

  useEffect(() => {
    if (session.role !== "doctor") return;
    let cancelled = false;

    async function loadSpecialty() {
      try {
        const result = await doctorProfileApi.get();
        if (!cancelled) setDoctorSpecialty(result.profile.specialty.trim());
      } catch {
        if (!cancelled) setDoctorSpecialty("");
      }
    }

    void loadSpecialty();

    function onSpecialtyUpdated(event: Event) {
      const specialty = (event as CustomEvent<string>).detail;
      setDoctorSpecialty(typeof specialty === "string" ? specialty.trim() : "");
    }

    window.addEventListener("doctor-specialty-updated", onSpecialtyUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("doctor-specialty-updated", onSpecialtyUpdated);
    };
  }, [session.role, session.userId]);

  const roleLabel =
    session.role === "doctor" ? doctorSpecialty : session.role === "patient" ? "Patient" : "";

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
    clearSession();
    setAccountOpen(false);
    void navigate({ to: "/login" });
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
    window.addEventListener(DOCTOR_NOTIFICATIONS_UPDATED_EVENT, loadNotifications);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", loadNotifications);
      window.removeEventListener(DOCTOR_NOTIFICATIONS_UPDATED_EVENT, loadNotifications);
    };
  }, [session.role]);

  const notificationsCount =
    session.role === "doctor" ? notifications.filter((note) => note.unread).length : 0;
  const notificationBadge = notificationsCount > 99 ? "99+" : String(notificationsCount);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      if (next) setExpandedNav({});
      return next;
    });
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        data-collapsed={collapsed ? "true" : "false"}
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-dvh w-[268px] shrink-0 flex-col transition-[width,transform] duration-300 ease-in-out lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed && "lg:w-[76px]",
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
          <div
            className={cn(
              "relative flex items-center gap-3 py-5",
              collapsed ? "lg:flex-col lg:gap-2.5 lg:px-2 lg:pt-5" : "px-5",
            )}
          >
            <div
              className="grid size-11 shrink-0 place-items-center rounded-2xl text-white"
              style={{
                background: "linear-gradient(135deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)",
                boxShadow: "0 6px 20px -6px rgba(59, 130, 246, 0.6)",
              }}
            >
              <Stethoscope className="size-5.5" strokeWidth={2.2} />
            </div>
            <div className={cn("min-w-0 flex-1 leading-tight", collapsed && "lg:hidden")}>
              <p className="font-sans text-[15.5px] font-bold text-white tracking-tight">
                AI Receptionist
              </p>
              {brandSuffix ? (
                <p className="text-[11px] font-medium text-[#60A5FA]/80 mt-0.5 uppercase tracking-[0.14em]">
                  {brandSuffix}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={toggleCollapsed}
              className={cn(
                "hidden lg:grid size-7 shrink-0 place-items-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white",
                collapsed && "lg:mt-0.5",
              )}
            >
              {collapsed ? (
                <ChevronRight className="size-4" strokeWidth={2.2} aria-hidden />
              ) : (
                <ChevronLeft className="size-4" strokeWidth={2.2} aria-hidden />
              )}
            </button>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            >
              <X className="size-4.5" strokeWidth={2.2} aria-hidden />
            </button>
          </div>
        </div>

        <nav
          className={cn(
            "flex-1 overflow-y-auto pb-5 sidebar-scroll scroll-clip",
            collapsed ? "lg:px-2 px-4" : "px-4",
          )}
        >
          {groups.map((group) => (
            <div key={group || "nav"} className="mb-2 first:mt-1.5">
              {group ? (
                <p
                  className={cn(
                    "mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35",
                    collapsed && "lg:hidden",
                  )}
                >
                  {group}
                </p>
              ) : null}
              <div className="space-y-1">
                {nav
                  .filter((item) => item.group === group)
                  .map((item) => {
                    if (item.children?.length) {
                      const isOpen = Boolean(expandedNav[item.label]) && !collapsed;
                      const childActive = item.children.some((child) => {
                        const base = child.to.replace(/\/$/, "");
                        return (
                          pathname === child.to ||
                          pathname === base ||
                          pathname.startsWith(`${base}/`)
                        );
                      });
                      return (
                        <div key={`nav-${item.label}`} className="space-y-0.5">
                          <button
                            type="button"
                            title={item.label}
                            aria-expanded={isOpen}
                            onClick={() => {
                              if (collapsed) {
                                setCollapsed(false);
                                setExpandedNav((current) => ({
                                  ...current,
                                  [item.label]: true,
                                }));
                                return;
                              }
                              setExpandedNav((current) => ({
                                ...current,
                                [item.label]: !current[item.label],
                              }));
                            }}
                            className={cn(
                              "sidebar-link group w-full text-left",
                              collapsed && "lg:justify-center lg:!px-0 lg:!gap-0",
                              childActive || isOpen
                                ? "sidebar-link-active"
                                : "sidebar-link-hover",
                            )}
                          >
                            <span className="grid size-[30px] shrink-0 place-items-center rounded-lg">
                              {getIcon(item.label)}
                            </span>
                            <span className={cn("flex-1 truncate", collapsed && "lg:hidden")}>
                              {item.label}
                            </span>
                            <span className={cn(collapsed && "lg:hidden")}>
                              {isOpen ? (
                                <ChevronDown
                                  className="size-[16px] shrink-0 text-white/75"
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              ) : (
                                <ChevronRight
                                  className="size-[16px] shrink-0 text-white/75"
                                  strokeWidth={2}
                                  aria-hidden
                                />
                              )}
                            </span>
                          </button>
                          {isOpen ? (
                            <div className="ml-4 space-y-0.5 border-l border-white/10 pl-2.5">
                              {item.children.map((child) => (
                                <Link
                                  key={child.to}
                                  {...({ to: child.to } as LinkProps)}
                                  onClick={() => setOpen(false)}
                                  activeOptions={{ exact: true }}
                                  activeProps={{ className: "sidebar-link-active" }}
                                  inactiveProps={{ className: "sidebar-link-hover" }}
                                  className="sidebar-link group !min-h-[36px] !gap-2.5 !py-1.5 !text-[12.5px] !font-medium text-white/80"
                                >
                                  <span className="grid size-[26px] shrink-0 place-items-center rounded-md opacity-90">
                                    {getSubnavIcon(child.label)}
                                  </span>
                                  <span className="flex-1 truncate">{child.label}</span>
                                </Link>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.to}
                        {...({ to: item.to } as LinkProps)}
                        title={item.label}
                        onClick={() => setOpen(false)}
                        activeOptions={{ exact: item.label === "Dashboard" }}
                        activeProps={{ className: "sidebar-link-active" }}
                        inactiveProps={{ className: "sidebar-link-hover" }}
                        className={cn(
                          "sidebar-link group",
                          collapsed && "lg:justify-center lg:!px-0 lg:!gap-0",
                        )}
                      >
                        <span className="relative grid size-[30px] shrink-0 place-items-center rounded-lg">
                          {getIcon(item.label)}
                          {collapsed &&
                          item.label === "Notifications" &&
                          notificationsCount > 0 ? (
                            <span
                              className="absolute -right-0.5 -top-0.5 size-2 rounded-full ring-2 ring-[#0B1E4B] lg:block"
                              style={{
                                background: "linear-gradient(135deg, #EF4444 0%, #F43F5E 100%)",
                              }}
                              aria-hidden
                            />
                          ) : null}
                        </span>
                        <span className={cn("flex-1 truncate", collapsed && "lg:hidden")}>
                          {item.label}
                        </span>
                        {item.label === "Notifications" && notificationsCount > 0 ? (
                          <span
                            className={cn(
                              "grid min-w-[20px] h-5 px-1.5 place-items-center rounded-full text-[10.5px] font-bold text-white",
                              collapsed && "lg:hidden",
                            )}
                            style={{
                              background: "linear-gradient(135deg, #EF4444 0%, #F43F5E 100%)",
                              boxShadow: "0 2px 8px -2px rgba(239, 68, 68, 0.6)",
                            }}
                          >
                            {notificationBadge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
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
        <header className="glass-header z-20 flex min-h-[60px] shrink-0 items-center justify-between gap-2 px-3 py-2.5 sm:min-h-[72px] sm:gap-3 sm:px-4 sm:py-3 md:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="grid size-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="size-5" strokeWidth={2} />
            </button>
          </div>

          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 md:gap-3">
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
                    className="absolute -right-0.5 -top-0.5 z-10 grid h-[16px] min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-bold leading-none text-white ring-2 ring-background"
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
                  className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.25rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
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
                className="flex max-w-full items-center gap-2 rounded-2xl border border-border/70 bg-card/60 py-1.5 pl-1.5 pr-2 text-left transition-all hover:bg-secondary hover:shadow-sm sm:gap-2.5 sm:pr-3"
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
                  {roleLabel ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {roleLabel}
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
                  className="absolute right-0 z-50 mt-1.5 w-[min(14rem,calc(100vw-1.25rem))] overflow-hidden rounded-xl border border-border bg-card shadow-lg sm:w-56"
                >
                  <div className="border-b border-border bg-muted/20 px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white"
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
                        <p className="truncate text-[12.5px] font-bold text-foreground">
                          {session.name}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {session.email}
                        </p>
                      </div>
                    </div>
                  </div>
                  {accountLinks.length > 0 ? (
                  <div className="border-b border-border py-1">
                    {accountLinks.map((item) => (
                      <Link
                        key={item.to}
                        {...({ to: item.to } as LinkProps)}
                        role="menuitem"
                        onClick={() => setAccountOpen(false)}
                        className="flex items-center gap-2 mx-1 my-0.5 px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium text-foreground transition-colors hover:bg-secondary"
                      >
                        <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground [&>svg]:size-3.5">
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
                    className="flex items-center gap-2 mx-1 my-1 w-[calc(100%-8px)] px-2.5 py-1.5 rounded-lg text-left text-[12.5px] font-semibold text-destructive transition-colors hover:bg-destructive/8"
                  >
                    <span className="grid size-6 place-items-center rounded-md bg-destructive/10 text-destructive">
                      <LogOut className="size-3.5" strokeWidth={2} />
                    </span>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-3 scrollbar-thin sm:p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full min-w-0 max-w-[1480px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
