import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button, Field, Input, Panel, SectionLabel } from "@/components/ui/primitives";
import { authApi, formatApiError } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — AI Receptionist" },
      { name: "description", content: "Request a password reset link for your AI Receptionist account." },
      { property: "og:title", content: "Reset password — AI Receptionist" },
      { property: "og:description", content: "Enter your email and we'll send reset instructions." },
    ],
  }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await authApi.forgotPassword({ email: email.trim() });
      setDevResetUrl(result.resetUrl ?? null);
      setSent(true);
    } catch (err) {
      setError(formatApiError(err, "Unable to request reset."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Forgot password"
      description="Enter the email on your account and we'll send reset instructions."
      footer={
        <p>
          <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      {sent ? (
        <Panel>
          <SectionLabel>Check your inbox</SectionLabel>
          <p className="mt-2 text-sm text-muted-foreground">
            If that email exists, password reset instructions have been prepared.
          </p>
          {devResetUrl ? (
            <p className="mt-3 break-all text-xs text-muted-foreground">
              Dev reset link:{" "}
              <a href={devResetUrl} className="font-medium text-primary underline-offset-4 hover:underline">
                {devResetUrl}
              </a>
            </p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSent(false);
              setDevResetUrl(null);
            }}
          >
            Use a different email
          </Button>
        </Panel>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <Field label="Email">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
