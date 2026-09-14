import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button, Field, Input, Panel, SectionLabel } from "@/components/ui/primitives";

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
  const [sent, setSent] = useState(false);

  return (
    <AuthLayout
      eyebrow="Account help"
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
            If that email exists, reset instructions are on the way. This is a demo screen, so no message is
            actually sent.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </Panel>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
        >
          <Field label="Email">
            <Input type="email" placeholder="you@example.com" />
          </Field>
          <Button type="submit" size="lg" className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
