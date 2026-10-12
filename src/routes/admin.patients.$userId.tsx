import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/patients/$userId")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
  component: () => null,
});
