import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy path — My Clinic is the user-facing page. */
export const Route = createFileRoute("/doctor/synthflow")({
  beforeLoad: () => {
    throw redirect({ to: "/doctor/clinic" });
  },
  component: () => null,
});
