import { createFileRoute } from "@tanstack/react-router";
import { DoctorAppointmentsView } from "@/components/doctor/DoctorAppointmentsView";

export const Route = createFileRoute("/doctor/appointments/pending")({
  head: () => ({
    meta: [
      { title: "Pending Appointments — Doctor portal" },
      { name: "description", content: "Confirm or cancel pending appointments." },
    ],
  }),
  component: () => <DoctorAppointmentsView view="pending" />,
});
