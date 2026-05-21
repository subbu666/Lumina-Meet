import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { PasswordStrength, computeStrength } from "@/components/ui-custom/PasswordStrength";
import { authService } from "@/api/services/authService";
import { extractError } from "@/api/apiClient";

const search = z.object({ email: z.string().email(), otp: z.string() });

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  validateSearch: search.parse,
  head: () => ({ meta: [{ title: "New password — Lumina Meet" }] }),
});

function ResetPasswordPage() {
  const { email, otp } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (computeStrength(password).score < 3) return toast.error("Choose a stronger password");
    if (password !== confirm) return toast.error("Passwords don't match");
    setLoading(true);
    try {
      await authService.resetPassword({ email, otp, password });
      toast.success("Password updated");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Set a new password" subtitle="Make it strong — you've got this.">
      <div className="space-y-4">
        <div>
          <FloatingInput
            label="New password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <PasswordStrength password={password} />
        </div>
        <FloatingInput
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <NeonButton fullWidth loading={loading} onClick={submit}>
          Update password
        </NeonButton>
      </div>
    </AuthShell>
  );
}
