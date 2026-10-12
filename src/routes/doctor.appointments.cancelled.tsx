import { createFileRoute } from "@tanstack/react-router";
import { DoctorAppointmentsView } from "@/components/doctor/DoctorAppointmentsView";

export const Route = createFileRoute("/doctor/appointments/cancelled")({
  head: () => ({
    meta: [
      { title: "Cancelled Appointments — Doctor portal" },
      { name: "description", content: "Cancelled appointments and details." },
    ],
  }),
  component: () => <DoctorAppointmentsView view="cancelled" />,
});
