import { createFileRoute, redirect } from "@tanstack/react-router";
import LandingApp from "../../landing/src/App";
import { getSession, homeForRole } from "@/lib/session";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const session = getSession();
    if (session?.token) {
      throw redirect({ to: homeForRole(session.role) });
    }
  },
  head: () => ({
    meta: [
      { title: "AI Receptionist — AI phone receptionist for clinics" },
      {
        name: "description",
        content:
          "An AI phone receptionist that books from your real schedule with SMS OTP confirmation, plus a doctor portal for appointments, patients, records, reminders and billing.",
      },
      { property: "og:title", content: "AI Receptionist — AI phone receptionist for clinics" },
      {
        property: "og:description",
        content:
          "An AI phone receptionist that books from your real schedule with SMS OTP confirmation.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return <LandingApp />;
}
