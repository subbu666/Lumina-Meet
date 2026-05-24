import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { WelcomeModal } from "@/components/modals/WelcomeModal";
import { authService } from "@/api/services/authService";
import { extractError } from "@/api/apiClient";
import { useAuthStore } from "@/store/authStore";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Log in — Lumina Meet" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [welcome, setWelcome] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const errs: Record<string, string> = {};
    if (!form.email) errs.email = "Email required";
    if (!form.password) errs.password = "Password required";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const { user, tokens } = await authService.login(form);
      setSession(user, tokens.accessToken, tokens.refreshToken);
      setWelcome(user.username);
      setTimeout(() => navigate({ to: "/dashboard" }), 2200);
    } catch (err) {
      const { code } = extractError(err);

      // Backend returns code "USER_NOT_FOUND" when no account exists for this email.
      // All other 401s (wrong password, suspended, etc.) show the generic message.
      if (code === "USER_NOT_FOUND") {
        toast.error("No account found for this email.", {
          description: "New here? Create an account and join in seconds.",
          duration: 6000,
          action: {
            label: "Sign up →",
            onClick: () => navigate({ to: "/signup" }),
          },
        });
      } else {
        toast.error("Invalid email or password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AuthShell
        title="Welcome back"
        subtitle="Log in to continue to your workspace."
        footer={
          <>
            Don't have an account?{" "}
            <Link to="/signup" className="text-[var(--neon-secondary)] hover:underline">
              Sign up
            </Link>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-4">
          <FloatingInput
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={errors.email}
          />
          <FloatingInput
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={errors.password}
          />
          <div className="flex justify-end -mt-1">
            <Link
              to="/forgot-password"
              className="text-xs text-[var(--neon-secondary)] hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <NeonButton type="submit" fullWidth loading={loading} className="mt-2">
            {loading ? "Logging in…" : "Log in"}
          </NeonButton>
        </form>
      </AuthShell>

      <WelcomeModal
        open={Boolean(welcome)}
        username={welcome ?? ""}
        onClose={() => setWelcome(null)}
      />
    </>
  );
}
