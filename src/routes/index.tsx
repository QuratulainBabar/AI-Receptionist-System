import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Button, Field, Input, SectionLabel, Badge } from "@/components/ui/primitives";
import { authApi, formatApiError } from "@/lib/api";
import { demoCredentials } from "@/lib/mock-data";
import { getSession, homeForRole, saveAuth } from "@/lib/session";
import { Eye, EyeOff, Mail, Lock, ArrowRight, Sparkles } from "lucide-react";

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
  const [showPassword, setShowPassword] = useState(false);

  function fill(index: number) {
    const demo = demoCredentials[index]!;
    setEmail(demo.email);
    setPassword(demo.password);
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const trimmedEmail = email.trim();
      const isAdminDemo = demoCredentials.some(
        (demo) => demo.role === "admin" && demo.email.toLowerCase() === trimmedEmail.toLowerCase(),
      );
      const result = isAdminDemo
        ? await authApi.adminLogin({ email: trimmedEmail, password })
        : await authApi.login({ email: trimmedEmail, password });
      saveAuth(result.user, result.token);
      if (result.user.role === "doctor") {
        await navigate({ to: "/doctor", search: { checkout: undefined } });
      } else {
        await navigate({ to: homeForRole(result.user.role) });
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to sign in."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to your portal and continue managing your practice with AI-powered efficiency."
      footer={
        <p>
          New here?{" "}
          <Link
            to="/signup"
            className="font-bold text-blue-600 underline-offset-4 hover:underline transition-colors"
          >
            Create an account
          </Link>
        </p>
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        <Field label="Email address" required>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4.5 text-muted-foreground/60"
              strokeWidth={2}
            />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@clinic.com"
              autoComplete="username"
              required
              className="!pl-11"
            />
          </div>
        </Field>

        <Field
          label="Password"
          required
          hint="At least 8 characters with a mix of letters and numbers."
        >
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4.5 text-muted-foreground/60"
              strokeWidth={2}
            />
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              className="!pl-11 !pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 grid size-9 place-items-center rounded-lg text-muted-foreground/70 hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4.5" strokeWidth={2} />
              ) : (
                <Eye className="size-4.5" strokeWidth={2} />
              )}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <div className="grid size-[18px] place-items-center rounded-md border-2 border-border bg-card transition-all group-hover:border-blue-500/50">
              <input type="checkbox" defaultChecked className="sr-only peer" />
              <div className="opacity-0 peer-checked:opacity-100 transition-opacity text-blue-600">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
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
            <span className="text-[13px] font-medium text-muted-foreground">
              Remember me for 30 days
            </span>
          </label>
          <Link
            to="/forgot-password"
            className="text-[13px] font-bold text-blue-600 underline-offset-4 hover:underline transition-colors"
          >
            Forgot password?
          </Link>
        </div>

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
              Signing in…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              Sign in
              <ArrowRight className="size-4.5" strokeWidth={2.3} />
            </span>
          )}
        </Button>
      </form>

      <div className="mt-8">
        <div className="flex items-center gap-4 mb-5">
          <div className="flex-1 h-px bg-border" />
          <SectionLabel className="!text-[10.5px]">Or try demo instantly</SectionLabel>
          <div className="flex-1 h-px bg-border" />
        </div>
        <div
          className="rounded-2xl p-5"
          style={{
            background:
              "linear-gradient(135deg, rgba(59, 130, 246, 0.06) 0%, rgba(139, 92, 246, 0.04) 100%)",
            border: "1px solid rgba(59, 130, 246, 0.18)",
          }}
        >
          <div className="flex items-center gap-2.5 mb-4">
            <span
              className="grid size-8 place-items-center rounded-lg"
              style={{
                background:
                  "linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(139, 92, 246, 0.12))",
                color: "#1D4ED8",
              }}
            >
              <Sparkles className="size-4" strokeWidth={2.3} />
            </span>
            <div>
              <p className="text-[13.5px] font-bold text-foreground">Demo accounts</p>
              <p className="text-[12px] text-muted-foreground">Fully featured portals to explore</p>
            </div>
          </div>
          <div className="space-y-3">
            {demoCredentials.map((demo, index) => (
              <div
                key={demo.email}
                className="flex items-center justify-between gap-3 rounded-xl p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-sm bg-white/80 border border-border/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[13.5px] font-bold text-foreground">Demo {demo.label}</p>
                    <Badge
                      tone={
                        demo.role === "admin"
                          ? "accent"
                          : demo.role === "doctor"
                            ? "primary"
                            : "info"
                      }
                      className="px-2 py-0.5 rounded-md text-[10px]"
                      dot
                    >
                      {demo.role}
                    </Badge>
                  </div>
                  <p className="font-mono text-[11.5px] text-muted-foreground/80 leading-relaxed">
                    {demo.email}
                    <br />
                    {demo.password}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-xl"
                  onClick={() => fill(index)}
                >
                  Use demo
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}
