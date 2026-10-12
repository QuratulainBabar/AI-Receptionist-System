import { createFileRoute } from "@tanstack/react-router";
import { DoctorAppointmentsView } from "@/components/doctor/DoctorAppointmentsView";

export const Route = createFileRoute("/doctor/appointments/confirmed")({
  head: () => ({
    meta: [
      { title: "Confirmed Appointments — Doctor portal" },
      { name: "description", content: "Manage confirmed appointments." },
    ],
  }),
  component: () => <DoctorAppointmentsView view="confirmed" />,
});
