import { createFileRoute, Outlet, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, type NavItem } from "@/components/layout/AppShell";
import { getSession, type Session } from "@/lib/session";

export const Route = createFileRoute("/patient")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const session = getSession();
    if (!session?.token || session.role !== "patient") {
      throw redirect({ to: "/" });
    }
  },
  component: PatientLayout,
});

const nav: NavItem[] = [
  { to: "/patient", label: "Dashboard", group: "Care" },
  { to: "/patient/chat", label: "AI Receptionist", group: "Care" },
  { to: "/patient/doctors", label: "Find a doctor", group: "Care" },
  { to: "/patient/book", label: "Book appointment", group: "Appointments" },
  { to: "/patient/appointments", label: "My appointments", group: "Appointments" },
  { to: "/patient/messages", label: "Follow-up messages", group: "Appointments" },
  { to: "/patient/history", label: "Medical history", group: "Records" },
  { to: "/patient/records", label: "Reports & records", group: "Records" },
  { to: "/patient/activity", label: "Activity history", group: "Records" },
];

function PatientLayout() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(() => getSession());

  useEffect(() => {
    const current = getSession();
    if (!current?.token || current.role !== "patient") {
      void router.navigate({ to: "/" });
      return;
    }
    setSession(current);
  }, [router]);

  if (!session) return null;

  return (
    <AppShell brandSuffix="Patient portal" nav={nav} session={session}>
      <Outlet />
    </AppShell>
  );
}
