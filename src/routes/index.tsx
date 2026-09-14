import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button, Field, Input, Panel, SectionLabel } from "@/components/ui/primitives";
import { demoCredentials } from "@/lib/mock-data";
import { saveSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — AI Receptionist" },
      {
        name: "description",
        content:
          "Sign in to the AI Receptionist: patients book appointments by chat, doctors manage their schedule and patient records.",
      },
      { property: "og:title", content: "Sign in — AI Receptionist" },
      {
        property: "og:description",
        content: "AI-powered medical reception for patients and doctors. Demo interface with sample data.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function fill(index: number) {
    const demo = demoCredentials[index]!;
    setEmail(demo.email);
    setPassword(demo.password);
    setError("");
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const match = demoCredentials.find(
      (item) => item.email === email.trim().toLowerCase() && item.password === password,
    );
    if (!match) {
      setError("Use one of the demo accounts listed below.");
      return;
    }
    saveSession(match.role);
    void navigate({ to: match.role === "doctor" ? "/doctor" : "/patient" });
  }

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in"
      description="Use a demo account to explore the patient or doctor experience."
      footer={
        <div className="space-y-2">
          <p>
            New here?{" "}
            <Link to="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
          <p>
            <Link to="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
              Forgot your password?
            </Link>
          </p>
        </div>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="username"
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full">
          Sign in
        </Button>
      </form>

      <Panel className="mt-6 p-4">
        <SectionLabel>Demo accounts</SectionLabel>
        <div className="mt-3 space-y-2">
          {demoCredentials.map((demo, index) => (
            <div key={demo.email} className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium capitalize">{demo.role}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {demo.email} · {demo.password}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => fill(index)}>
                Use
              </Button>
            </div>
          ))}
        </div>
      </Panel>
    </AuthLayout>
  );
}
