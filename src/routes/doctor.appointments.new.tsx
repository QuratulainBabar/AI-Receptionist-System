import { createFileRoute } from "@tanstack/react-router";
import { DoctorAppointmentsView } from "@/components/doctor/DoctorAppointmentsView";

export const Route = createFileRoute("/doctor/appointments/new")({
  head: () => ({
    meta: [
      { title: "New Appointments — Doctor portal" },
      { name: "description", content: "Recently created appointments." },
    ],
  }),
  component: () => <DoctorAppointmentsView view="new" />,
});
