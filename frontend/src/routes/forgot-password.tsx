import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/auth/AuthShell";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { OtpInput } from "@/components/ui-custom/OtpInput";
import { PasswordStrength, computeStrength } from "@/components/ui-custom/PasswordStrength";
import { authService } from "@/api/services/authService";
import { extractError } from "@/api/apiClient";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  head: () => ({ meta: [{ title: "Reset password — Lumina Meet" }] }),
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Phase 1 — send OTP to email
  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter a valid email");
    setLoading(true);
    try {
      await authService.forgotPassword({ email });
      toast.success("Reset code sent — check your inbox");
      setStep(1);
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  // Phase 2 — verify OTP against the backend
  const verify = async () => {
    if (otp.length < 6) return toast.error("Enter all 6 digits");
    setLoading(true);
    try {
      await authService.verifyResetOtp({ email, otp });
      toast.success("Code verified");
      setStep(2);
    } catch (err) {
      // Shows backend message e.g. "Invalid reset code. 2 attempts remaining."
      toast.error(extractError(err).message);
      // Clear the OTP input so the user can try again cleanly
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  // Phase 3 — send email + otp + newPassword together
  const reset = async () => {
    if (computeStrength(password).score < 3) return toast.error("Choose a stronger password");
    if (password !== confirm) return toast.error("Passwords don't match");
    setLoading(true);
    try {
      await authService.resetPassword({ email, otp, password });
      toast.success("Password updated — please log in");
      navigate({ to: "/login" });
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Three quick steps to get back in."
      footer={
        <Link to="/login" className="text-[var(--neon-secondary)] hover:underline">
          Back to login
        </Link>
      }
    >
      <Stepper step={step} />

      <div className="mt-6 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ── Step 0 : Email ── */}
          {step === 0 && (
            <motion.div
              key="s0"
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -30, opacity: 0 }}
              className="space-y-4"
            >
              <FloatingInput
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <NeonButton fullWidth loading={loading} onClick={send}>
                Send reset code
              </NeonButton>
            </motion.div>
          )}

          {/* ── Step 1 : Enter OTP — verified against backend ── */}
          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -30, opacity: 0 }}
              className="space-y-5"
            >
              <p className="text-center text-sm text-muted-foreground">
                Code sent to <span className="text-foreground font-medium">{email}</span>.
              </p>
              <OtpInput value={otp} onChange={setOtp} />
              <NeonButton fullWidth loading={loading} onClick={verify} disabled={otp.length < 6}>
                Verify code
              </NeonButton>
              <p className="text-center text-xs text-muted-foreground">
                Didn't receive it?{" "}
                <button
                  type="button"
                  className="text-[var(--neon-secondary)] hover:underline"
                  onClick={async () => {
                    try {
                      await authService.forgotPassword({ email });
                      toast.success("New code sent");
                      setOtp("");
                    } catch (err) {
                      toast.error(extractError(err).message);
                    }
                  }}
                >
                  Resend
                </button>
              </p>
            </motion.div>
          )}

          {/* ── Step 2 : New password ── */}
          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ x: 30, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -30, opacity: 0 }}
              className="space-y-4"
            >
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
                onKeyDown={(e) => e.key === "Enter" && reset()}
              />
              <NeonButton fullWidth loading={loading} onClick={reset}>
                Update password
              </NeonButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AuthShell>
  );
}

function Stepper({ step }: { step: number }) {
  const labels = ["Email", "Verify", "New password"];
  return (
    <div className="flex items-center justify-between gap-2">
      {labels.map((l, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={l} className="flex flex-1 items-center gap-2">
            <motion.div
              animate={{ scale: active ? 1.05 : 1 }}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                done
                  ? "bg-gradient-neon text-white"
                  : active
                    ? "bg-white/10 text-foreground border border-[var(--neon-primary)]"
                    : "bg-white/5 text-muted-foreground"
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </motion.div>
            <span className={`text-xs ${active ? "text-foreground" : "text-muted-foreground"}`}>
              {l}
            </span>
            {i < labels.length - 1 && (
              <div className={`mx-1 h-px flex-1 ${done ? "bg-gradient-neon" : "bg-white/10"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
