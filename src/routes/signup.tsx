import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button, Field, Input } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/mock-data";
import { authApi, formatApiError } from "@/lib/api";
import { getSession, homeForRole, saveAuth } from "@/lib/session";

export const Route = createFileRoute("/signup")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const session = getSession();
    if (session?.token) {
      throw redirect({ to: homeForRole(session.role) });
    }
  },
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
  { role: "patient", title: "Patient", description: "Book visits & manage records" },
  { role: "doctor", title: "Doctor", description: "Manage schedule & patients" },
];

function SignupPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("patient");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (fullName.trim().length < 2) {
      setError("Full name must be at least 2 characters.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.signup({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        role,
      });
      saveAuth(result.user, result.token);
      if (result.user.role === "doctor") {
        await navigate({
          to: "/doctor/onboarding",
          search: { checkout: undefined, payment: undefined },
        });
      } else {
        await navigate({ to: homeForRole(result.user.role) });
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to create account."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      description="Choose your role and get started with the portal."
      footer={
        <p>
          Already have an account?{" "}
          <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium text-foreground">I am signing up as</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {roleOptions.map((option) => (
              <button
                type="button"
                key={option.role}
                onClick={() => setRole(option.role)}
                aria-pressed={role === option.role}
                className={cn(
                  "rounded-xl border p-3.5 text-left transition-colors",
                  role === option.role
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/35",
                )}
              >
                <span className="block text-[13px] font-semibold text-foreground">{option.title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Full name">
          <Input
            className="border-border bg-card"
            placeholder="Enter your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </Field>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthLayout>
  );
}
