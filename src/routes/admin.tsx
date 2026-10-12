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
      throw redirect({ to: "/login" });
    }
  },
  component: AdminLayout,
});

const nav: NavItem[] = [
  { to: "/admin", label: "Dashboard", group: "Overview" },
  { to: "/admin/doctors", label: "Doctors", group: "Users" },
  { to: "/admin/subscriptions", label: "Subscriptions", group: "Billing" },
  { to: "/admin/earnings", label: "Earnings", group: "Billing" },
  { to: "/admin/settings", label: "Settings", group: "Management" },
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
      void router.navigate({ to: "/login" });
      return;
    }
    setSession(current);
  }, [router, isLogin]);

  if (isLogin) return <Outlet />;
  if (!session) return null;

  return (
    <AppShell brandSuffix="" nav={nav} session={session}>
      <Outlet />
    </AppShell>
  );
}
