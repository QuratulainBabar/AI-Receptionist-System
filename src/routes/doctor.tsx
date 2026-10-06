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
      throw redirect({ to: "/" });
    }
  },
  component: DoctorLayout,
});

const CLINICAL_PREFIXES = [
  "/doctor/schedule",
  "/doctor/notifications",
  "/doctor/patients",
  "/doctor/records",
  "/doctor/activity",
];

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
      void router.navigate({ to: "/" });
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
              search: { checkout: undefined, payment: "failed" },
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
            search: { checkout: undefined, payment: undefined },
            replace: true,
          });
          return;
        }
        if (next.enrolled && path === "/doctor/onboarding") {
          await router.navigate({ to: "/doctor", search: { checkout: undefined }, replace: true });
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
    return () => {
      cancelled = true;
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
    ? access.modules.map((item) => ({ to: item.to, label: item.label, group: item.group }))
    : [];
  const accountMenu = access.modules
    .filter((item) => ["patients", "records", "activity", "profile", "availability"].includes(item.id))
    .map((item) => ({ to: item.to, label: item.label }));

  return (
    <DoctorAccessContext.Provider value={access}>
      <AppShell
        brandSuffix={access.enrolled ? "Doctor portal" : "Doctor onboarding"}
        nav={nav}
        session={session}
        accountMenu={accountMenu}
      >
        <Outlet />
      </AppShell>
    </DoctorAccessContext.Provider>
  );
}
