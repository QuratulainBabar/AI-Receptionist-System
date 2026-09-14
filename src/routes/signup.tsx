import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button, Field, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/mock-data";
import { saveSession } from "@/lib/session";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create an account — AI Receptionist" },
      {
        name: "description",
        content: "Create a patient or doctor account to use the AI Receptionist appointment system.",
      },
      { property: "og:title", content: "Create an account — AI Receptionist" },
      { property: "og:description", content: "Choose your role and set up your AI Receptionist account." },
    ],
  }),
  component: SignupPage,
});

const roleOptions: { role: Role; title: string; description: string }[] = [
  { role: "patient", title: "Patient", description: "Ask questions, find a doctor and book visits" },
  { role: "doctor", title: "Doctor", description: "Manage your schedule and patient records" },
];

function SignupPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("patient");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    saveSession(role);
    void navigate({ to: role === "doctor" ? "/doctor" : "/patient" });
  }

  return (
    <AuthLayout
      eyebrow="Get started"
      title="Create your account"
      description="Pick how you'll use the clinic, then fill in your details."
      footer={
        <p>
          Already registered?{" "}
          <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium">I am a</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {roleOptions.map((option) => (
              <button
                type="button"
                key={option.role}
                onClick={() => setRole(option.role)}
                aria-pressed={role === option.role}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  role === option.role
                    ? "border-primary bg-primary/8 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40",
                )}
              >
                <span className="block text-[13px] font-semibold text-foreground">{option.title}</span>
                <span className="mt-0.5 block text-xs">{option.description}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Full name">
          <Input placeholder={role === "doctor" ? "Dr. Daniel Osei" : "Maya Okonkwo"} />
        </Field>
        <Field label="Email">
          <Input type="email" placeholder="you@example.com" />
        </Field>
        {role === "doctor" ? (
          <Field label="Speciality">
            <Input placeholder="Cardiology" />
          </Field>
        ) : (
          <Field label="Phone">
            <Input placeholder="+1 (415) 555-0148" />
          </Field>
        )}
        <Field label="Password" hint="At least 8 characters.">
          <Input type="password" placeholder="••••••••" />
        </Field>

        <Button type="submit" size="lg" className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
