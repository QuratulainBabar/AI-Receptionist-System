import { createFileRoute, Outlet, redirect, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, type NavItem } from "@/components/layout/AppShell";
import { doctorSubscriptionApi, type ApiDoctorAccess } from "@/lib/api";
import { DoctorAccessContext } from "@/lib/doctor-access";
import { getSession, type Session } from "@/lib/session";

export const Route = createFileRoute("/doctor")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const session = getSession();
    if (!session?.token || session.role !== "doctor") {
      throw redirect({ to: "/login" });
    }
  },
  component: DoctorLayout,
});

const CLINICAL_PREFIXES = [
  "/doctor/appointments",
  "/doctor/schedule",
  "/doctor/notifications",
  "/doctor/patients",
  "/doctor/records",
  "/doctor/activity",
  "/doctor/team",
];

const APPOINTMENT_NAV_CHILDREN = [
  { to: "/doctor/appointments/", label: "All Appointments" },
  { to: "/doctor/appointments/new", label: "New" },
  { to: "/doctor/appointments/pending", label: "Pending" },
  { to: "/doctor/appointments/confirmed", label: "Confirmed" },
  { to: "/doctor/appointments/completed", label: "Completed" },
  { to: "/doctor/appointments/cancelled", label: "Cancelled" },
  { to: "/doctor/appointments/follow-ups", label: "Follow-Up Appointments" },
] as const;

function isClinicalPath(pathname: string) {
  return CLINICAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function DoctorLayout() {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [session, setSession] = useState<Session | null>(() => getSession());
  const [access, setAccess] = useState<ApiDoctorAccess | null>(null);
  const [gateError, setGateError] = useState("");

  useEffect(() => {
    const current = getSession();
    if (!current?.token || current.role !== "doctor") {
      void router.navigate({ to: "/login" });
      return;
    }
    setSession(current);
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function resolveAccess() {
      setGateError("");
      try {
        const params = new URLSearchParams(window.location.search);
        const sessionId = params.get("session_id");
        if (sessionId) {
          const confirmed = await doctorSubscriptionApi.confirm(sessionId);
          if (cancelled) return;
          setAccess(confirmed.access);
          if (!confirmed.access.profileComplete) {
            await router.navigate({
              to: "/doctor/profile",
              search: { setup: "1" },
              replace: true,
            });
            return;
          }
          await router.navigate({
            to: "/doctor",
            search: { checkout: "success" },
            replace: true,
          });
          return;
        }

        const result = await doctorSubscriptionApi.access();
        if (cancelled) return;
        const next = result.access;
        setAccess(next);
        const path = window.location.pathname;
        const onProfile = path === "/doctor/profile" || path.startsWith("/doctor/profile/");
        const onOnboarding = path === "/doctor/onboarding";

        // Incomplete profile → force setup. Once profile is complete, full dashboard is allowed
        // (subscription enrollment is optional for portal access after profile save).
        if (!next.profileComplete) {
          if (onOnboarding) return;
          if (!onProfile) {
            await router.navigate({
              to: "/doctor/profile",
              search: { setup: "1" },
              replace: true,
            });
          }
          return;
        }

        if (path === "/doctor/onboarding") {
          await router.navigate({ to: "/doctor", search: { checkout: undefined }, replace: true });
          return;
        }
      } catch (err) {
        if (!cancelled) {
          setGateError(err instanceof Error ? err.message : "Unable to check enrollment.");
        }
      }
    }

    void resolveAccess();
    function refreshSession() {
      const current = getSession();
      if (current) setSession(current);
    }
    function refreshAccess() {
      void resolveAccess();
    }
    window.addEventListener("session-updated", refreshSession);
    window.addEventListener("doctor-access-refresh", refreshAccess);
    return () => {
      cancelled = true;
      window.removeEventListener("session-updated", refreshSession);
      window.removeEventListener("doctor-access-refresh", refreshAccess);
    };
  }, [router, session, pathname]);

  if (!session) return null;

  if (!access) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-sm text-muted-foreground">
        {gateError || "Checking your enrollment…"}
      </div>
    );
  }

  const onboarding = pathname === "/doctor/onboarding";
  const onProfile = pathname === "/doctor/profile" || pathname.startsWith("/doctor/profile/");
  if (!access.profileComplete && !onboarding && !onProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-sm text-muted-foreground">
        Opening profile setup…
      </div>
    );
  }

  const setupNav: NavItem[] = [
    { to: "/doctor/profile", label: "My profile", group: "" },
  ];
  const navSource = access.modules.length ? access.modules : setupNav.map((item) => ({
    id: "profile",
    label: item.label,
    to: item.to,
    group: item.group,
  }));
  const nav: NavItem[] = navSource.map((item) => {
    if (item.id === "schedule" || item.label === "Appointments") {
      return {
        to: "/doctor/appointments",
        label: "Appointments",
        group: item.group,
        children: [...APPOINTMENT_NAV_CHILDREN],
      };
    }
    if (item.id === "team" || item.label === "Users") {
      return {
        to: "/doctor/team",
        label: "Users",
        group: item.group,
        children: [{ to: "/doctor/team", label: "Team members" }],
      };
    }
    return { to: item.to, label: item.label, group: item.group };
  });
  const accountMenu = navSource
    .filter((item) => item.id === "profile" || item.label === "My profile")
    .map((item) => ({ to: item.to, label: item.label }));

  return (
    <DoctorAccessContext.Provider value={access}>
      <AppShell
        brandSuffix=""
        nav={nav}
        session={session}
        accountMenu={accountMenu}
      >
        <Outlet />
      </AppShell>
    </DoctorAccessContext.Provider>
  );
}
