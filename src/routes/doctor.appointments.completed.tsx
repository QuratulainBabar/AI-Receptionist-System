import { createFileRoute } from "@tanstack/react-router";
import { DoctorAppointmentsView } from "@/components/doctor/DoctorAppointmentsView";

export const Route = createFileRoute("/doctor/appointments/completed")({
  head: () => ({
    meta: [
      { title: "Completed Appointments — Doctor portal" },
      { name: "description", content: "Completed visit history." },
    ],
  }),
  component: () => <DoctorAppointmentsView view="completed" />,
});
