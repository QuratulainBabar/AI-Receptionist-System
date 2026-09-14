import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell, type NavItem } from "@/components/layout/AppShell";
import { doctorSession } from "@/lib/session";

export const Route = createFileRoute("/doctor")({
  component: DoctorLayout,
});

const nav: NavItem[] = [
  { to: "/doctor", label: "Dashboard", group: "Today" },
  { to: "/doctor/schedule", label: "Appointment schedule", group: "Today" },
  { to: "/doctor/notifications", label: "Notifications", group: "Today" },
  { to: "/doctor/patients", label: "Patient list", group: "Patients" },
  { to: "/doctor/records", label: "History & reports", group: "Patients" },
  { to: "/doctor/activity", label: "Activity history", group: "Patients" },
];

function DoctorLayout() {
  return (
    <AppShell brandSuffix="Doctor portal" nav={nav} session={doctorSession}>
      <Outlet />
    </AppShell>
  );
}
