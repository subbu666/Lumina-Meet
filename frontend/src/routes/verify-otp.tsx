import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { z } from "zod";
import { AuthShell } from "@/components/auth/AuthShell";
import { OtpInput } from "@/components/ui-custom/OtpInput";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { authService } from "@/api/services/authService";
import { extractError } from "@/api/apiClient";
import { useAuthStore } from "@/store/authStore";

const searchSchema = z.object({
  email: z.string().email(),
  flow: z.enum(["signup", "reset"]).default("signup"),
});

export const Route = createFileRoute("/verify-otp")({
  component: VerifyOtpPage,
  validateSearch: searchSchema.parse,
  head: () => ({ meta: [{ title: "Verify OTP — Lumina Meet" }] }),
});

function VerifyOtpPage() {
  const { email, flow } = Route.useSearch();
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [timer, setTimer] = useState(60);

  useEffect(() => {
    if (timer <= 0) return;
    const id = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timer]);

  const submit = async () => {
    if (otp.length < 6) return toast.error("Enter all 6 digits");
    setLoading(true);
    try {
      if (flow === "signup") {
        // Signup flow — verifies OTP, creates account, returns tokens
        const res = await authService.verifyOtp({ email, otp });
        setSession(res.user, res.tokens);
        toast.success("Verified! Please login 🎉");
        navigate({ to: "/login" });
      } else {
        // Reset flow — verifies OTP against password:reset: Redis key
        await authService.verifyResetOtp({ email, otp });
        toast.success("OTP verified — set your new password");
        navigate({ to: "/reset-password", search: { email, otp } });
      }
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      if (flow === "signup") {
        await authService.resendOtp({ email });
      } else {
        // Re-trigger forgot password to generate a fresh OTP
        await authService.forgotPassword({ email });
      }
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
    <AuthShell
      title="Enter verification code"
      subtitle={
        <>
          We sent a 6-digit code to <span className="text-foreground font-medium">{email}</span>.
        </>
      }
    >
      <div className="space-y-6">
        <OtpInput value={otp} onChange={setOtp} />

        <NeonButton fullWidth loading={loading} onClick={submit} disabled={otp.length < 6}>
          {loading ? "Verifying…" : "Verify code"}
        </NeonButton>

        {/* Resend timer */}
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
              onClick={resend}
              className="text-[var(--neon-secondary)] hover:underline"
            >
              Resend code
            </button>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
