import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { PasswordStrength, computeStrength } from "@/components/ui-custom/PasswordStrength";
import { authService } from "@/api/services/authService";
import { extractError } from "@/api/apiClient";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({ meta: [{ title: "Sign up - Lumina Meet" }] }),
});

function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof typeof form>(k: K, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.username.trim().length < 3) e.username = "At least 3 characters";
    if (!/^[a-zA-Z0-9_ ]+$/.test(form.username))
      e.username = "Only letters, numbers, underscores, and spaces allowed";
    if (form.username.startsWith(" ") || form.username.endsWith(" "))
      e.username = "Username cannot start or end with a space";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email";
    if (computeStrength(form.password).score < 3) e.password = "Choose a stronger password";
    if (form.password !== form.confirm) e.confirm = "Passwords don't match";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await authService.signup({
        username: form.username,
        email: form.email,
        password: form.password,
      });
      toast.success("Account created. Verify your email.");
      navigate({ to: "/verify-otp", search: { email: form.email, flow: "signup" } });
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start hosting meetings in seconds."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-[var(--neon-secondary)] hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <FloatingInput
          label="Username"
          value={form.username}
          onChange={(e) => set("username", e.target.value)}
          error={errors.username}
        />
        <FloatingInput
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          error={errors.email}
        />
        <div>
          <FloatingInput
            label="Password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            error={errors.password}
          />
          <PasswordStrength password={form.password} />
        </div>
        <FloatingInput
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={(e) => set("confirm", e.target.value)}
          error={errors.confirm}
        />
        <NeonButton type="submit" fullWidth loading={loading} className="mt-2">
          {loading ? "Creating account…" : "Create account"}
        </NeonButton>
      </form>
    </AuthShell>
  );
}
