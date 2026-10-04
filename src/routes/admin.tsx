import { createFileRoute, Outlet, redirect, useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, type NavItem } from "@/components/layout/AppShell";
import { getSession, type Session } from "@/lib/session";

export const Route = createFileRoute("/admin")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    if (location.pathname === "/admin/login") return;
    const session = getSession();
    if (!session?.token || session.role !== "admin") {
      throw redirect({ to: "/admin/login" });
    }
  },
  component: AdminLayout,
});

const nav: NavItem[] = [
  { to: "/admin", label: "Dashboard", group: "Overview" },
  { to: "/admin/synthflow", label: "Synthflow", group: "Phone AI" },
  { to: "/admin/voice-calls", label: "Voice calls", group: "Phone AI" },
  { to: "/admin/appointments", label: "Appointments", group: "Clinic" },
  { to: "/admin/doctors", label: "Doctors", group: "Users" },
  { to: "/admin/patients", label: "Patients", group: "Users" },
];

function AdminLayout() {
  const router = useRouter();
  const location = useLocation();
  const isLogin = location.pathname === "/admin/login";
  const [session, setSession] = useState<Session | null>(() => getSession());

  useEffect(() => {
    if (isLogin) return;
    const current = getSession();
    if (!current?.token || current.role !== "admin") {
      void router.navigate({ to: "/admin/login" });
      return;
    }
    setSession(current);
  }, [router, isLogin]);

  if (isLogin) return <Outlet />;
  if (!session) return null;

  return (
    <AppShell brandSuffix="Super Admin" nav={nav} session={session}>
      <Outlet />
    </AppShell>
  );
}
