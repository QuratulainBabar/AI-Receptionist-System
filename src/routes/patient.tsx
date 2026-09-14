import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell, type NavItem } from "@/components/layout/AppShell";
import { patientSession } from "@/lib/session";

export const Route = createFileRoute("/patient")({
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
  return (
    <AppShell brandSuffix="Patient portal" nav={nav} session={patientSession}>
      <Outlet />
    </AppShell>
  );
}
