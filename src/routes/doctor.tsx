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
          if (!confirmed.enrolled) {
            await router.navigate({
              to: "/doctor/onboarding",
              search: {
                checkout: undefined,
                payment: "failed",
                plan: undefined,
                cycle: undefined,
              },
              replace: true,
            });
            return;
          }
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
        if (!next.enrolled && path !== "/doctor/onboarding") {
          await router.navigate({
            to: "/doctor/onboarding",
            search: {
              checkout: undefined,
              payment: undefined,
              plan: undefined,
              cycle: undefined,
            },
            replace: true,
          });
          return;
        }
        if (next.enrolled && path === "/doctor/onboarding") {
          if (!next.profileComplete) {
            await router.navigate({
              to: "/doctor/profile",
              search: { setup: "1" },
              replace: true,
            });
            return;
          }
          await router.navigate({ to: "/doctor", search: { checkout: undefined }, replace: true });
          return;
        }
        if (
          next.enrolled &&
          !next.profileComplete &&
          path !== "/doctor/profile" &&
          path !== "/doctor/onboarding"
        ) {
          await router.navigate({
            to: "/doctor/profile",
            search: { setup: "1" },
            replace: true,
          });
          return;
        }
        if (next.enrolled && !next.ready && isClinicalPath(path)) {
          await router.navigate({ to: "/doctor", search: { checkout: undefined }, replace: true });
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
    window.addEventListener("session-updated", refreshSession);
    return () => {
      cancelled = true;
      window.removeEventListener("session-updated", refreshSession);
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
  if (!access.enrolled && !onboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-sm text-muted-foreground">
        Continue to plan selection…
      </div>
    );
  }

  const nav: NavItem[] = access.enrolled
    ? access.modules.map((item) => {
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
      })
    : [];
  const accountMenu = access.modules
    .filter((item) => ["profile"].includes(item.id))
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
