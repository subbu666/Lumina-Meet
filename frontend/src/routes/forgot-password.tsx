import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
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
import { NoAccountModal } from "@/components/modals/NoAccountModal";

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

  // Resend timer — starts when we move to step 1
  const [timer, setTimer] = useState(60);

  useEffect(() => {
    if (step !== 1) return;
    if (timer <= 0) return;
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [step, timer]);

  // Controls the "no account found" modal
  const [noAccountOpen, setNoAccountOpen] = useState(false);

  // Phase 1 — send OTP to email
  const send = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter a valid email");
    setLoading(true);
    try {
      const result = await authService.forgotPassword({ email });

      // Backend returns success:false + code:"USER_NOT_FOUND" at HTTP 200
      // when the email has no registered account (anti-enumeration pattern).
      if (result?.code === "USER_NOT_FOUND") {
        setNoAccountOpen(true);
        return;
      }

      toast.success("Reset code sent — check your inbox");
      setTimer(60); // reset timer each time an OTP is freshly sent
      setStep(1);
    } catch (err) {
      const { code } = extractError(err);
      if (code === "USER_NOT_FOUND") {
        setNoAccountOpen(true);
      } else {
        toast.error(extractError(err).message);
      }
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
      toast.error(extractError(err).message);
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

  // Resend handler (used in Step 1)
  const resend = async () => {
    try {
      await authService.forgotPassword({ email });
      toast.success("New code sent — check your inbox");
      setOtp("");
      setTimer(60);
    } catch (err) {
      toast.error(extractError(err).message);
    }
  };

  const pct = ((60 - timer) / 60) * 100;
  const circumference = 2 * Math.PI * 15;

  return (
    <>
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

            {/* ── Step 1 : Enter OTP ── */}
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

                {/* Resend with circular countdown — mirrors verify-otp page */}
                <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                  {timer > 0 ? (
                    <>
                      <div className="relative h-7 w-7">
                        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
                          <circle
                            cx="18"
                            cy="18"
                            r="15"
                            fill="none"
                            stroke="oklch(1 0 0 / 0.1)"
                            strokeWidth="3"
                          />
                          <motion.circle
                            cx="18"
                            cy="18"
                            r="15"
                            fill="none"
                            stroke="oklch(0.82 0.16 210)"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={(1 - pct / 100) * circumference}
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center text-[10px] font-mono">
                          {timer}
                        </div>
                      </div>
                      <span>Resend in {timer}s</span>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-[var(--neon-secondary)] hover:underline"
                      onClick={resend}
                    >
                      Resend code
                    </button>
                  )}
                </div>
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

      {/* No-account modal — shown when forgotPassword detects USER_NOT_FOUND */}
      <NoAccountModal open={noAccountOpen} email={email} onClose={() => setNoAccountOpen(false)} />
    </>
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
