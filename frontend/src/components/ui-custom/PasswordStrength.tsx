import { motion } from "framer-motion";
import { useMemo } from "react";

export function computeStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const tiers = [
    { label: "Too weak", color: "oklch(0.65 0.25 25)" },
    { label: "Weak", color: "oklch(0.72 0.22 35)" },
    { label: "Fair", color: "oklch(0.82 0.18 85)" },
    { label: "Good", color: "oklch(0.75 0.18 160)" },
    { label: "Strong", color: "oklch(0.82 0.16 210)" },
    { label: "Excellent", color: "oklch(0.75 0.18 305)" },
  ];
  return { score, ...tiers[score] };
}

export function PasswordStrength({ password }: { password: string }) {
  const { score, label, color } = useMemo(() => computeStrength(password), [password]);
  const pct = (score / 5) * 100;
  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 12px ${color}` }}
        />
      </div>
      <p className="text-xs" style={{ color }}>
        {label}
      </p>
    </div>
  );
}
