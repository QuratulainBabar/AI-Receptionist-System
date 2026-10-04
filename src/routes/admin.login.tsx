import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button, Field, Input } from "@/components/ui/primitives";
import { authApi, formatApiError } from "@/lib/api";
import { getSession, homeForRole, saveAuth } from "@/lib/session";

export const Route = createFileRoute("/admin/login")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const session = getSession();
    if (session?.token && session.role === "admin") {
      throw redirect({ to: "/admin" });
    }
  },
  head: () => ({
    meta: [
      { title: "Super Admin sign in — AI Receptionist" },
      { name: "description", content: "Sign in to the Super Admin dashboard." },
    ],
  }),
  component: AdminLoginPage,
});

function takeAdminDemoCredentials() {
  if (typeof window === "undefined") return { email: "", password: "" };
  try {
    const raw = window.sessionStorage.getItem("ai-receptionist-admin-demo");
    if (!raw) return { email: "", password: "" };
    window.sessionStorage.removeItem("ai-receptionist-admin-demo");
    const parsed = JSON.parse(raw) as { email?: string; password?: string };
    return { email: parsed.email ?? "", password: parsed.password ?? "" };
  } catch {
    return { email: "", password: "" };
  }
}

function AdminLoginPage() {
  const navigate = useNavigate();
  const [demo] = useState(takeAdminDemoCredentials);
  const [email, setEmail] = useState(demo.email);
  const [password, setPassword] = useState(demo.password);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await authApi.adminLogin({ email: email.trim(), password });
      saveAuth(result.user, result.token);
      await navigate({ to: homeForRole(result.user.role) });
    } catch (err) {
      setError(formatApiError(err, "Unable to sign in as admin."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Super Admin"
      description="Sign in to manage doctors, patients and account status."
      footer={
        <p>
          <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to patient / doctor sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Admin email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
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
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in as Super Admin"}
        </Button>
        <p className="text-center font-mono text-[11px] text-muted-foreground">
          Demo: admin@example.com · Admin123
        </p>
      </form>
    </AuthLayout>
  );
}
