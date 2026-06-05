import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, X } from "lucide-react";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";
import { NeonButton } from "@/components/ui-custom/NeonButton";

interface Props {
  open: boolean;
  /** The title that caused the conflict */
  conflictingTitle: string;
  /**
   * Called when the user accepts a new title and wants to retry.
   * The parent must re-fire its original API call with this new title.
   */
  onRetry: (newTitle: string) => void;
  onClose: () => void;
}

// ─── Smart suggestions ────────────────────────────────────────────────────────

function buildSuggestions(base: string): string[] {
  const trimmed = base.trim();
  const now = new Date();
  const month = now.toLocaleString("default", { month: "short" });
  const year = now.getFullYear();
  return [`${trimmed} – ${month} ${year}`, `${trimmed} v2`, `${trimmed} (copy)`, `${trimmed} #2`];
}

// ─── Animated particle ring ───────────────────────────────────────────────────

function PulseRing({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-[22px] border border-[oklch(0.72_0.22_35/0.45)] pointer-events-none"
      initial={{ scale: 1, opacity: 0.6 }}
      animate={{ scale: 1.18, opacity: 0 }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay }}
    />
  );
}

export function DuplicateTitleModal({ open, conflictingTitle, onRetry, onClose }: Props) {
  const [newTitle, setNewTitle] = useState("");
  const [titleError, setTitleError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Hydrate input with a smart suggestion on open
  useEffect(() => {
    if (open) {
      setNewTitle(
        `${conflictingTitle.trim()} – ${new Date().toLocaleString("default", { month: "short" })} ${new Date().getFullYear()}`,
      );
      setTitleError("");
      // Focus the input after the entrance animation
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [open, conflictingTitle]);

  const suggestions = buildSuggestions(conflictingTitle);

  const handleRetry = () => {
    const trimmed = newTitle.trim();
    if (!trimmed) {
      setTitleError("Please enter a title");
      return;
    }
    if (trimmed.toLowerCase() === conflictingTitle.trim().toLowerCase()) {
      setTitleError("This is the same title - please choose something different");
      return;
    }
    onRetry(trimmed);
  };

  return (
    <AnimatePresence>
      {open && (
        // ── Backdrop ────────────────────────────────────────────────────────
        <motion.div
          key="dup-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[60] flex items-center justify-center px-4"
          style={{ background: "oklch(0.05 0.01 265 / 0.88)", backdropFilter: "blur(18px)" }}
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          {/* Ambient orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute -top-24 -left-24 w-72 h-72 rounded-full"
              style={{
                background: "radial-gradient(circle, oklch(0.72 0.22 35 / 0.22), transparent 70%)",
              }}
              animate={{ scale: [1, 1.15, 1], x: [0, 20, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -bottom-16 -right-16 w-56 h-56 rounded-full"
              style={{
                background: "radial-gradient(circle, oklch(0.65 0.22 280 / 0.18), transparent 70%)",
              }}
              animate={{ scale: [1, 1.2, 1], x: [0, -15, 0] }}
              transition={{ duration: 12, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            />
          </div>

          {/* ── Modal card ─────────────────────────────────────────────────── */}
          <motion.div
            key="dup-modal"
            initial={{ scale: 0.88, opacity: 0, y: 28 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            className="relative w-full max-w-md"
          >
            {/* Outer neon glow border */}
            <motion.div
              className="absolute -inset-[1.5px] rounded-[30px]"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.72 0.22 35 / 0.7), oklch(0.65 0.22 280 / 0.4), oklch(0.72 0.22 35 / 0.5))",
              }}
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            <div
              className="relative rounded-[29px] overflow-hidden"
              style={{
                background: "oklch(0.18 0.025 265 / 0.96)",
                backdropFilter: "blur(28px)",
              }}
            >
              {/* Animated gradient top bar */}
              <motion.div
                className="h-[3px] w-full"
                style={{
                  background:
                    "linear-gradient(90deg, oklch(0.65 0.22 280), oklch(0.82 0.16 210), oklch(0.72 0.22 35), oklch(0.75 0.18 305), oklch(0.65 0.22 280))",
                  backgroundSize: "300% 100%",
                }}
                animate={{ backgroundPosition: ["0% 0%", "100% 0%", "0% 0%"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
              />

              <div className="px-8 pt-7 pb-7">
                {/* Close button */}
                <button
                  onClick={onClose}
                  className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>

                {/* ── Icon ──────────────────────────────────────────────────── */}
                <div className="flex flex-col items-center text-center mb-6">
                  <div className="relative mb-5">
                    <motion.div
                      className="relative flex h-[72px] w-[72px] items-center justify-center rounded-[22px]"
                      style={{
                        background: "oklch(0.72 0.22 35 / 0.13)",
                        border: "1px solid oklch(0.72 0.22 35 / 0.4)",
                        boxShadow: "0 0 36px -6px oklch(0.72 0.22 35 / 0.5)",
                      }}
                      animate={{
                        boxShadow: [
                          "0 0 20px -8px oklch(0.72 0.22 35 / 0.4)",
                          "0 0 50px -4px oklch(0.72 0.22 35 / 0.7)",
                          "0 0 20px -8px oklch(0.72 0.22 35 / 0.4)",
                        ],
                      }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <PulseRing delay={0} />
                      <PulseRing delay={0.9} />
                      <AlertCircle className="h-8 w-8" style={{ color: "oklch(0.85 0.18 35)" }} />
                    </motion.div>
                  </div>

                  {/* Eyebrow */}
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-2"
                    style={{ color: "oklch(0.82 0.2 35)" }}
                  >
                    Duplicate Title Detected
                  </motion.p>

                  <motion.h2
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-[1.35rem] font-bold leading-snug mb-2"
                    style={{ color: "oklch(0.97 0.01 250)" }}
                  >
                    This title already exists
                  </motion.h2>

                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                    className="text-[13.5px] leading-relaxed"
                    style={{ color: "oklch(0.70 0.03 260)" }}
                  >
                    You already have a meeting named{" "}
                    <span
                      className="font-semibold font-mono"
                      style={{ color: "oklch(0.82 0.16 210)" }}
                    >
                      "{conflictingTitle}"
                    </span>
                    .<br />
                    Each title must be unique across your meeting history.
                  </motion.p>
                </div>

                {/* ── Hint banner ────────────────────────────────────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex items-start gap-3 rounded-2xl px-4 py-3 mb-5"
                  style={{
                    background: "oklch(0.72 0.22 35 / 0.07)",
                    border: "1px solid oklch(0.72 0.22 35 / 0.18)",
                  }}
                >
                  <AlertCircle
                    className="h-4 w-4 shrink-0 mt-0.5"
                    style={{ color: "oklch(0.82 0.2 35)" }}
                  />
                  <p
                    className="text-[12.5px] leading-relaxed"
                    style={{ color: "oklch(0.72 0.22 35 / 0.85)" }}
                  >
                    Unique titles help you find meetings in your history. Try adding a date, project
                    name, or version number.
                  </p>
                </motion.div>

                {/* ── Suggestion chips ───────────────────────────────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="mb-5"
                >
                  <p
                    className="text-[11px] uppercase tracking-[0.08em] mb-2.5"
                    style={{ color: "oklch(0.7 0.03 260)" }}
                  >
                    Suggested titles
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <motion.button
                        key={s}
                        whileHover={{ scale: 1.03, y: -1 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => {
                          setNewTitle(s);
                          setTitleError("");
                        }}
                        className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-all border"
                        style={{
                          background: "oklch(0.65 0.22 280 / 0.1)",
                          borderColor: "oklch(0.65 0.22 280 / 0.3)",
                          color: "oklch(0.82 0.16 210)",
                        }}
                      >
                        {s}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>

                {/* ── Input ──────────────────────────────────────────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mb-5"
                >
                  <FloatingInput
                    ref={inputRef}
                    label="New meeting title"
                    value={newTitle}
                    onChange={(e) => {
                      setNewTitle(e.target.value);
                      if (titleError) setTitleError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleRetry()}
                    maxLength={200}
                  />
                  <AnimatePresence>
                    {titleError && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="mt-1.5 text-xs"
                        style={{ color: "oklch(0.82 0.2 35)" }}
                      >
                        {titleError}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>

                {/* ── Actions ────────────────────────────────────────────────── */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="flex gap-2.5"
                >
                  <NeonButton variant="outline" onClick={onClose} className="flex-1">
                    Cancel
                  </NeonButton>
                  <motion.button
                    whileHover={{ scale: 1.02, brightness: 1.1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleRetry}
                    className="flex-[1.6] flex items-center justify-center gap-2 rounded-2xl text-sm font-semibold text-white transition-all"
                    style={{
                      background:
                        "linear-gradient(135deg, oklch(0.65 0.22 280), oklch(0.82 0.16 210))",
                      padding: "11px 16px",
                      boxShadow: "0 6px 28px -6px oklch(0.65 0.22 280 / 0.6)",
                    }}
                  >
                    Try this title <ArrowRight className="h-4 w-4" />
                  </motion.button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
