import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/doctor/schedule")({
  beforeLoad: () => {
    throw redirect({ to: "/doctor/appointments" });
  },
  component: () => null,
});
