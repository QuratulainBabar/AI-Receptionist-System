import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button, Field, Input, Badge } from "@/components/ui/primitives";
import { authApi, formatApiError } from "@/lib/api";
import { getSession, homeForRole, saveAuth } from "@/lib/session";
import { Mail, Lock, UserCircle2, ArrowRight, Sparkles, CheckCircle2, Shield } from "lucide-react";

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
        content: "Create a doctor account to use the AI Receptionist appointment system.",
      },
      { property: "og:title", content: "Create an account — AI Receptionist" },
      {
        property: "og:description",
        content: "Create your doctor account for the AI Receptionist.",
      },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const passwordStrength = [password.length >= 8, /[A-Z]/.test(password), /[0-9]/.test(password)];
  const strengthScore = passwordStrength.filter(Boolean).length;

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
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const result = await authApi.signup({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        role: "doctor",
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
      variant="signup"
      eyebrow="Doctor onboarding · Step 1"
      title="Create your clinic account"
      description="Set up your practice on AI Receptionist and start receiving AI-managed appointments today."
      footer={
        <p>
          Already have an account?{" "}
          <Link
            to="/"
            className="font-bold text-blue-600 underline-offset-4 hover:underline transition-colors"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form className="space-y-4.5" onSubmit={submit}>
        <Field label="Full name" required>
          <div className="relative">
            <UserCircle2
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4.5 text-muted-foreground/60"
              strokeWidth={2}
            />
            <Input
              className="!pl-11"
              placeholder="Dr. Sarah Johnson"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
        </Field>

        <Field
          label="Work email"
          required
          hint="We'll send setup instructions and appointment alerts here."
        >
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4.5 text-muted-foreground/60"
              strokeWidth={2}
            />
            <Input
              type="email"
              placeholder="you@clinicpractice.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="!pl-11"
            />
          </div>
        </Field>

        <Field label="Create password" required>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4.5 text-muted-foreground/60"
              strokeWidth={2}
            />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="!pl-11"
            />
          </div>
          {password ? (
            <div className="mt-2.5 space-y-2">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="flex-1 h-1.5 rounded-full transition-all duration-300"
                    style={{
                      background:
                        i < strengthScore
                          ? strengthScore === 3
                            ? "linear-gradient(90deg, #10B981, #059669)"
                            : strengthScore === 2
                              ? "linear-gradient(90deg, #F59E0B, #D97706)"
                              : "linear-gradient(90deg, #EF4444, #DC2626)"
                          : "#E2E8F0",
                    }}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-3">
                {[
                  { t: "8+ characters", ok: password.length >= 8 },
                  { t: "Uppercase letter", ok: /[A-Z]/.test(password) },
                  { t: "Number included", ok: /[0-9]/.test(password) },
                  { t: "No spaces", ok: !/\s/.test(password) },
                ].map((c) => (
                  <div
                    key={c.t}
                    className="flex items-center gap-1.5 text-[11.5px] font-medium"
                    style={{
                      color: c.ok ? "#047857" : "#94A3B8",
                    }}
                  >
                    {c.ok ? (
                      <CheckCircle2 className="size-3.5" strokeWidth={3} />
                    ) : (
                      <span className="size-3.5 rounded-full border-2 border-current opacity-40" />
                    )}
                    {c.t}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Field>

        <Field label="Confirm password" required>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4.5 text-muted-foreground/60"
              strokeWidth={2}
            />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
              className="!pl-11"
            />
          </div>
          {confirmPassword && password !== confirmPassword ? (
            <p className="text-[11.5px] font-semibold text-destructive flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-destructive" />
              Passwords don't match
            </p>
          ) : confirmPassword && password === confirmPassword ? (
            <p className="text-[11.5px] font-semibold text-emerald-600 flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5" strokeWidth={3} />
              Passwords match
            </p>
          ) : null}
        </Field>

        <label className="flex items-start gap-3 cursor-pointer group pt-1">
          <div className="grid size-[18px] mt-0.5 place-items-center rounded-md border-2 border-border bg-card transition-all group-hover:border-blue-500/50 shrink-0">
            <input type="checkbox" className="sr-only peer" defaultChecked />
            <div className="opacity-0 peer-checked:opacity-100 transition-opacity text-blue-600">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6.5L4.5 9L10 3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          <span className="text-[12.5px] leading-relaxed text-muted-foreground">
            I agree to the{" "}
            <a href="#" className="font-bold text-blue-600 underline-offset-2 hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="font-bold text-blue-600 underline-offset-2 hover:underline">
              Privacy Policy
            </a>
            , including consent to process my clinical data securely.
          </span>
        </label>

        {error ? (
          <div
            className="rounded-xl p-4 text-[13px] font-medium"
            style={{
              background:
                "linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(239, 68, 68, 0.03))",
              borderLeft: "3px solid #EF4444",
              color: "#DC2626",
            }}
          >
            {error}
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="w-full rounded-xl text-[14px]"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin size-4.5" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="opacity-25"
                />
                <path
                  fill="currentColor"
                  className="opacity-75"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Creating account…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Create clinic account
              <ArrowRight className="size-4.5" strokeWidth={2.3} />
            </span>
          )}
        </Button>
      </form>

      <div
        className="mt-6 flex items-start gap-3 rounded-2xl p-4.5"
        style={{
          background:
            "linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)",
          border: "1px solid rgba(16, 185, 129, 0.18)",
        }}
      >
        <Shield className="size-5 shrink-0 mt-0.5" strokeWidth={2.3} style={{ color: "#047857" }} />
        <div>
          <p className="text-[13px] font-bold" style={{ color: "#047857" }}>
            Your data is secure
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "#065F46" }}>
            End-to-end encryption, HIPAA-compliant storage, and role-based access. We never sell
            patient data.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[
          { icon: <Sparkles className="size-3.5" />, label: "AI reception in minutes" },
          { icon: <CheckCircle2 className="size-3.5" />, label: "Setup in under 5 min" },
          { icon: <Shield className="size-3.5" />, label: "Cancel anytime" },
        ].map((b) => (
          <div
            key={b.label}
            className="rounded-xl p-3 text-center flex flex-col items-center gap-1.5 bg-muted/50"
          >
            <span style={{ color: "#1D4ED8" }}>{b.icon}</span>
            <span className="text-[10.5px] font-bold text-muted-foreground leading-tight">
              {b.label}
            </span>
          </div>
        ))}
      </div>
    </AuthLayout>
  );
}
