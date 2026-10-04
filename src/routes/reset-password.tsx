import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button, Field, Input } from "@/components/ui/primitives";
import { ApiError, authApi } from "@/lib/api";

const searchSchema = z.object({
  token: z.string().optional().catch(""),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Set new password — AI Receptionist" },
      { name: "description", content: "Choose a new password for your AI Receptionist account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { token: tokenFromSearch } = Route.useSearch();
  const [token, setToken] = useState(tokenFromSearch || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const result = await authApi.resetPassword({ token: token.trim(), password });
      setSuccess(result.message);
      setTimeout(() => {
        void navigate({ to: "/" });
      }, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to reset password. Is the API running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Set a new password"
      description="Paste your reset token if needed, then choose a new password."
      footer={
        <p>
          <Link to="/" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Reset token">
          <Input value={token} onChange={(e) => setToken(e.target.value)} required />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </Field>
        <Field label="Confirm password">
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {success ? <p className="text-sm text-primary">{success}</p> : null}
        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Updating…" : "Update password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
