import { createFileRoute } from "@tanstack/react-router";
import { DoctorAppointmentsView } from "@/components/doctor/DoctorAppointmentsView";

export const Route = createFileRoute("/doctor/appointments/")({
  head: () => ({
    meta: [
      { title: "All Appointments — Doctor portal" },
      {
        name: "description",
        content: "View and manage all patient appointments.",
      },
    ],
  }),
  component: () => <DoctorAppointmentsView view="all" />,
});
