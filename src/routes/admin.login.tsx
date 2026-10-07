import { createFileRoute, redirect } from "@tanstack/react-router";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/admin/login")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const session = getSession();
    if (session?.token && session.role === "admin") {
      throw redirect({ to: "/admin" });
    }
    throw redirect({ to: "/" });
  },
  component: () => null,
});
