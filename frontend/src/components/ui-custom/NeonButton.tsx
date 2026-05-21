import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "danger" | "outline";
type Props = HTMLMotionProps<"button"> & {
  variant?: Variant;
  loading?: boolean;
  fullWidth?: boolean;
};

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-neon text-white shadow-[0_8px_30px_-8px_oklch(0.65_0.22_280/0.6)] hover:shadow-[0_12px_40px_-8px_oklch(0.65_0.22_280/0.9)]",
  outline:
    "border border-white/15 bg-white/5 text-foreground hover:bg-white/10 hover:border-white/25",
  ghost: "text-muted-foreground hover:text-foreground hover:bg-white/5",
  danger:
    "bg-gradient-to-r from-[oklch(0.65_0.25_25)] to-[oklch(0.72_0.22_35)] text-white shadow-[0_8px_30px_-8px_oklch(0.72_0.22_35/0.6)]",
};

export const NeonButton = forwardRef<HTMLButtonElement, Props>(function NeonButton(
  { className, variant = "primary", loading, fullWidth, children, disabled, ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <motion.button
      ref={ref}
      whileHover={isDisabled ? undefined : { scale: 1.02 }}
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
      disabled={isDisabled}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium transition-all overflow-hidden",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        fullWidth && "w-full",
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading && <span className="absolute inset-0 shimmer pointer-events-none" />}
      <span className="relative flex items-center gap-2">{children as React.ReactNode}</span>
    </motion.button>
  );
});
