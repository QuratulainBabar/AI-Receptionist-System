import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, type NavItem } from "@/components/layout/AppShell";
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

const nav: NavItem[] = [
  { to: "/doctor", label: "Dashboard", group: "Today" },
  { to: "/doctor/schedule", label: "Appointment schedule", group: "Today" },
  { to: "/doctor/notifications", label: "Notifications", group: "Today" },
  { to: "/doctor/profile", label: "My profile", group: "Practice" },
  { to: "/doctor/availability", label: "Availability", group: "Practice" },
  { to: "/doctor/patients", label: "Patient list", group: "Patients" },
  { to: "/doctor/records", label: "History & reports", group: "Patients" },
  { to: "/doctor/activity", label: "Activity history", group: "Patients" },
];

function DoctorLayout() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(() => getSession());

  useEffect(() => {
    const current = getSession();
    if (!current?.token || current.role !== "doctor") {
      void router.navigate({ to: "/" });
      return;
    }
    setSession(current);
  }, [router]);

  if (!session) return null;

  return (
    <AppShell brandSuffix="Doctor portal" nav={nav} session={session}>
      <Outlet />
    </AppShell>
  );
}
