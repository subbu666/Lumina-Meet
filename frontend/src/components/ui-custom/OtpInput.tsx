import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const setDigit = (i: number, d: string) => {
    const clean = d.replace(/\D/g, "").slice(-1);
    const arr = value.padEnd(length, " ").split("");
    arr[i] = clean || " ";
    const next = arr.join("").trimEnd();
    onChange(next);
    if (clean && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (text) {
      e.preventDefault();
      onChange(text);
      refs.current[Math.min(text.length, length - 1)]?.focus();
    }
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-3" onPaste={onPaste}>
      {Array.from({ length }).map((_, i) => {
        const filled = Boolean(value[i] && value[i] !== " ");
        return (
          <motion.div
            key={i}
            animate={filled ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 0.25 }}
          >
            <input
              ref={(el) => { refs.current[i] = el; }}
              value={value[i] && value[i] !== " " ? value[i] : ""}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              inputMode="numeric"
              maxLength={1}
              className={cn(
                "h-12 w-10 sm:h-14 sm:w-12 rounded-xl bg-white/[0.04] border text-center text-xl font-semibold outline-none transition-all",
                filled
                  ? "border-[var(--neon-primary)] text-foreground shadow-[0_0_0_3px_oklch(0.65_0.22_280/0.2)]"
                  : "border-white/10 text-foreground focus:border-[var(--neon-secondary)] focus:shadow-[0_0_0_3px_oklch(0.82_0.16_210/0.2)]",
              )}
            />
          </motion.div>
        );
      })}
    </div>
  );
}
