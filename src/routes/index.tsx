import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button, Field, Input, SectionLabel } from "@/components/ui/primitives";
import { authApi, formatApiError } from "@/lib/api";
import { demoCredentials } from "@/lib/mock-data";
import { getSession, homeForRole, saveAuth } from "@/lib/session";

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
      { title: "Sign in — AI Receptionist" },
      {
        name: "description",
        content:
          "Sign in to the AI Receptionist: patients book appointments by chat, doctors manage their schedule and patient records.",
      },
      { property: "og:title", content: "Sign in — AI Receptionist" },
      {
        property: "og:description",
        content: "AI-powered medical reception for patients and doctors.",
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
  const [loading, setLoading] = useState(false);

  function fill(index: number) {
    const demo = demoCredentials[index]!;
    if (demo.role === "admin") {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(
          "ai-receptionist-admin-demo",
          JSON.stringify({ email: demo.email, password: demo.password }),
        );
      }
      void navigate({ to: "/admin/login" });
      return;
    }
    setEmail(demo.email);
    setPassword(demo.password);
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await authApi.login({ email: email.trim(), password });
      saveAuth(result.user, result.token);
      await navigate({ to: homeForRole(result.user.role) });
    } catch (err) {
      setError(formatApiError(err, "Unable to sign in."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to continue to your portal."
      footer={
        <p>
          New here?{" "}
          <Link to="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
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
            required
          />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </Field>

        <div className="flex items-center justify-between gap-3 text-xs">
          <Link to="/admin/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Super Admin sign in
          </Link>
          <Link to="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
            Forgot password?
          </Link>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="mt-6 rounded-xl border border-dashed border-border bg-muted/40 p-4">
        <SectionLabel>Demo credentials</SectionLabel>
        <div className="mt-3 space-y-3">
          {demoCredentials.map((demo, index) => (
            <div key={demo.email} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">Demo {demo.label}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {demo.email}
                  <br />
                  {demo.password}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => fill(index)}>
                Use {demo.label.toLowerCase()} demo
              </Button>
            </div>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
