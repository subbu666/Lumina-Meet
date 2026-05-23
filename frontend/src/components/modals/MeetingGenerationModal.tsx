import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Sparkles } from "lucide-react";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";

const PHASES = [
  "Initializing secure session…",
  "Allocating edge server…",
  "Securing end-to-end channel…",
  "Generating meeting link…",
  "Finalizing…",
];

const ANIMATION_DURATION = 5000;

/**
 * Three internal screens:
 *  "title"    — user types a meeting title and hits Enter / "Create"
 *  "loading"  — circular progress animation while API call runs
 *  "done"     — link ready, copy + join actions
 */
type Screen = "title" | "loading" | "done";

interface Props {
  open: boolean;
  /** null while API call is in-flight; set by parent once the call resolves */
  link: string | null;
  onClose: () => void;
  /** Called with the title when the user confirms — parent triggers the API call */
  onGenerate: (title: string) => void;
}

export function MeetingGenerationModal({ open, link, onClose, onGenerate }: Props) {
  // ── Screen state ────────────────────────────────────────────────────────────
  const [screen, setScreen] = useState<Screen>("title");
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState("");

  // ── Animation state (only used in "loading" screen) ─────────────────────────
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);
  const [animDone, setAnimDone] = useState(false);
  const rafRef = useRef<number>(0);

  // ── Copy state ───────────────────────────────────────────────────────────────
  const [copied, setCopied] = useState(false);

  // ── Reset all state when modal closes ───────────────────────────────────────
  useEffect(() => {
    if (!open) {
      cancelAnimationFrame(rafRef.current);
      setScreen("title");
      setTitle("");
      setTitleError("");
      setPhase(0);
      setProgress(0);
      setAnimDone(false);
      setCopied(false);
    }
  }, [open]);

  // ── Start the circular animation once we enter the "loading" screen ─────────
  useEffect(() => {
    if (screen !== "loading") {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const start = performance.now();

    const tick = (t: number) => {
      const elapsed = t - start;
      const p = Math.min(1, elapsed / ANIMATION_DURATION);
      setProgress(p);
      setPhase(Math.min(PHASES.length - 1, Math.floor(p * PHASES.length)));
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setAnimDone(true);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen]);

  // ── Move to "done" when BOTH animation finished AND link is available ────────
  useEffect(() => {
    if (screen === "loading" && animDone && link) {
      setScreen("done");
    }
  }, [screen, animDone, link]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleCreate = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError("Please enter a meeting title");
      return;
    }
    setTitleError("");
    setScreen("loading");
    onGenerate(trimmed);
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── SVG ring values ──────────────────────────────────────────────────────────
  const R = 80;
  const C = 2 * Math.PI * R;
  const offset = C - progress * C;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#05070e]/90 backdrop-blur-xl px-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", damping: 22 }}
            className="relative w-full max-w-lg glass-strong rounded-3xl p-8 sm:p-10 text-center overflow-hidden"
          >
            {/* Ambient background glow */}
            <motion.div
              className="absolute inset-0 -z-10 pointer-events-none"
              animate={{
                opacity: screen === "loading" ? 0.3 + progress * 0.5 : 0.3,
              }}
              style={{
                background:
                  "radial-gradient(circle at center, oklch(0.65 0.22 280 / 0.4), transparent 70%)",
              }}
            />

            <AnimatePresence mode="wait">
              {/* ── SCREEN 1: Title prompt ─────────────────────────────────── */}
              {screen === "title" && (
                <motion.div
                  key="title-screen"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-6"
                >
                  {/* Icon */}
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-neon glow-primary">
                    <Sparkles className="h-6 w-6 text-white" />
                  </div>

                  {/* Heading */}
                  <div>
                    <h3 className="text-2xl font-semibold text-gradient">Name your meeting</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      Give it a title so you can find it in your history later.
                    </p>
                  </div>

                  {/* Input */}
                  <div className="text-left">
                    <FloatingInput
                      label="Meeting title"
                      value={title}
                      onChange={(e) => {
                        setTitle(e.target.value);
                        if (titleError) setTitleError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreate();
                      }}
                      placeholder=" "
                      autoFocus
                      maxLength={200}
                    />
                    {titleError && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-1.5 text-xs text-[var(--neon-danger)]"
                      >
                        {titleError}
                      </motion.p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <NeonButton variant="outline" fullWidth onClick={onClose}>
                      Cancel
                    </NeonButton>
                    <NeonButton fullWidth onClick={handleCreate}>
                      Create meeting →
                    </NeonButton>
                  </div>
                </motion.div>
              )}

              {/* ── SCREEN 2: Loading / progress ring ─────────────────────── */}
              {screen === "loading" && (
                <motion.div
                  key="loading-screen"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="relative mx-auto h-48 w-48">
                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 200 200">
                      <circle
                        cx="100"
                        cy="100"
                        r={R}
                        fill="none"
                        stroke="oklch(1 0 0 / 0.08)"
                        strokeWidth="6"
                      />
                      <motion.circle
                        cx="100"
                        cy="100"
                        r={R}
                        fill="none"
                        stroke="url(#grad)"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={C}
                        strokeDashoffset={offset}
                      />
                      <defs>
                        <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="oklch(0.65 0.22 280)" />
                          <stop offset="50%" stopColor="oklch(0.82 0.16 210)" />
                          <stop offset="100%" stopColor="oklch(0.75 0.18 305)" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-4xl font-bold text-gradient">
                        {Math.round(progress * 100)}%
                      </div>
                    </div>
                  </div>

                  {/* Meeting title preview */}
                  <p className="mt-4 text-sm font-medium truncate px-4">{title}</p>

                  <div className="mt-3 h-6">
                    <AnimatePresence mode="wait">
                      <motion.p
                        key={phase}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="text-sm text-muted-foreground"
                      >
                        {animDone && !link ? "Connecting to server…" : PHASES[phase]}
                      </motion.p>
                    </AnimatePresence>
                  </div>

                  {/* Waiting-for-API dots */}
                  {animDone && !link && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-3 flex justify-center gap-1"
                    >
                      {[0, 1, 2].map((i) => (
                        <motion.span
                          key={i}
                          className="h-1.5 w-1.5 rounded-full bg-[var(--neon-secondary)]"
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                        />
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* ── SCREEN 3: Done — link ready ────────────────────────────── */}
              {screen === "done" && (
                <motion.div
                  key="done-screen"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-neon glow-primary">
                    <Check className="h-8 w-8 text-white" />
                  </div>

                  <div>
                    <h3 className="text-2xl font-semibold text-gradient">Meeting ready</h3>
                    <p className="mt-1 text-sm font-medium truncate px-4">{title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Share this link to invite others.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <Link2 className="h-4 w-4 text-[var(--neon-secondary)] shrink-0" />
                    <code className="flex-1 truncate text-xs text-left text-foreground">
                      {link}
                    </code>
                    <button
                      onClick={copy}
                      className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-medium hover:bg-white/15 transition flex items-center gap-1"
                    >
                      {copied ? (
                        <>
                          <Check className="h-3 w-3" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3 w-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <NeonButton variant="outline" fullWidth onClick={onClose}>
                      Close
                    </NeonButton>
                    <NeonButton fullWidth onClick={() => link && window.open(link, "_blank")}>
                      Join now
                    </NeonButton>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
