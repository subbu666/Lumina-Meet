import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const FloatingInput = forwardRef<HTMLInputElement, Props>(function FloatingInput(
  { label, error, hint, className, id, value, defaultValue, onFocus, onBlur, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [focused, setFocused] = useState(false);
  const hasValue = Boolean(value || defaultValue);
  const floated = focused || hasValue || Boolean((rest as { placeholder?: string }).placeholder);

  return (
    <div className="w-full">
      <div
        className={cn(
          "relative rounded-xl transition-all",
          "bg-white/[0.04] border",
          focused ? "border-[var(--neon-primary)] shadow-[0_0_0_4px_oklch(0.65_0.22_280/0.15)]" : "border-white/10",
          error && "border-[oklch(0.65_0.25_25)] shadow-[0_0_0_4px_oklch(0.65_0.25_25/0.15)]",
        )}
      >
        <label
          htmlFor={inputId}
          className={cn(
            "pointer-events-none absolute left-4 transition-all duration-200",
            floated
              ? "top-1.5 text-[10px] uppercase tracking-wider text-[var(--neon-secondary)]"
              : "top-1/2 -translate-y-1/2 text-sm text-muted-foreground",
          )}
        >
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          value={value}
          defaultValue={defaultValue}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          className={cn(
            "w-full bg-transparent px-4 pt-6 pb-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/50",
            className,
          )}
          {...rest}
        />
      </div>
      {(error || hint) && (
        <p className={cn("mt-1.5 text-xs", error ? "text-[oklch(0.75_0.2_25)]" : "text-muted-foreground")}>
          {error || hint}
        </p>
      )}
    </div>
  );
});
