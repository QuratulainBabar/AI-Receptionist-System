import { createFileRoute } from "@tanstack/react-router";
import { DoctorAppointmentsView } from "@/components/doctor/DoctorAppointmentsView";

export const Route = createFileRoute("/doctor/appointments/follow-ups")({
  head: () => ({
    meta: [
      { title: "Follow-Up Appointments — Doctor portal" },
      { name: "description", content: "Follow-ups linked to previous visits." },
    ],
  }),
  component: () => <DoctorAppointmentsView view="follow-ups" />,
});
