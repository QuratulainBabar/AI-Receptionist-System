import { createFileRoute, Outlet, redirect, useMatches } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/patients")({
  beforeLoad: () => {
    throw redirect({ to: "/admin" });
  },
  component: AdminPatientsLayout,
});

function AdminPatientsLayout() {
  const matches = useMatches();
  const isDetail = matches.some((match) => match.routeId === "/admin/patients/$userId");
  if (isDetail) return <Outlet />;
  return null;
}
