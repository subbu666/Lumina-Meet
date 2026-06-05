import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Sparkles } from "lucide-react";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";
import { DuplicateTitleModal } from "@/components/modals/DuplicateTitleModal";
import { extractDuplicateTitle } from "@/api/services/meetingService";

const PHASES = [
  "Initializing secure session…",
  "Allocating edge server…",
  "Securing end-to-end channel…",
  "Generating meeting link…",
  "Finalizing…",
];

const ANIMATION_DURATION = 5000;

type Screen = "title" | "loading" | "done";

interface Props {
  open: boolean;
  link: string | null;
  duplicateTitle?: string | null;
  onClose: () => void;
  onGenerate: (title: string) => void;
}

export function MeetingGenerationModal({
  open,
  link,
  duplicateTitle = null,
  onClose,
  onGenerate,
}: Props) {
  const [screen, setScreen] = useState<Screen>("title");
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState("");

  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);
  const [animDone, setAnimDone] = useState(false);
  const rafRef = useRef<number>(0);

  const [copied, setCopied] = useState(false);

  const [dupModalOpen, setDupModalOpen] = useState(false);
  const [dupConflictingTitle, setDupConflictingTitle] = useState("");

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
      setDupModalOpen(false);
      setDupConflictingTitle("");
    }
  }, [open]);

  useEffect(() => {
    if (duplicateTitle) {
      cancelAnimationFrame(rafRef.current);
      setProgress(0);
      setPhase(0);
      setAnimDone(false);
      setDupConflictingTitle(duplicateTitle);
      setDupModalOpen(true);
      setScreen("title");
    }
  }, [duplicateTitle]);

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

  useEffect(() => {
    if (screen === "loading" && animDone && link) {
      setScreen("done");
    }
  }, [screen, animDone, link]);

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

  const handleDupRetry = (newTitle: string) => {
    setDupModalOpen(false);
    setDupConflictingTitle("");
    setTitle(newTitle);
    setProgress(0);
    setPhase(0);
    setAnimDone(false);
    setScreen("loading");
    onGenerate(newTitle);
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const R = 80;
  const C = 2 * Math.PI * R;
  const offset = C - progress * C;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{
              background: "color-mix(in oklch, var(--background) 90%, transparent)",
              backdropFilter: "blur(20px)",
            }}
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
                    "radial-gradient(circle at center, color-mix(in oklch, var(--neon-primary) 40%, transparent), transparent 70%)",
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
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-neon glow-primary">
                      <Sparkles className="h-6 w-6 text-white" />
                    </div>

                    <div>
                      <h3 className="text-2xl font-semibold text-gradient">Name your meeting</h3>
                      <p className="mt-1.5 text-sm" style={{ color: "var(--muted-foreground)" }}>
                        Give it a title so you can find it in your history later.
                      </p>
                    </div>

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
                          className="mt-1.5 text-xs"
                          style={{ color: "var(--neon-danger)" }}
                        >
                          {titleError}
                        </motion.p>
                      )}
                    </div>

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
                          stroke="color-mix(in oklch, var(--foreground) 8%, transparent)"
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
                            <stop offset="0%" stopColor="var(--neon-primary)" />
                            <stop offset="50%" stopColor="var(--neon-secondary)" />
                            <stop offset="100%" stopColor="var(--neon-accent)" />
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-4xl font-bold text-gradient">
                          {Math.round(progress * 100)}%
                        </div>
                      </div>
                    </div>

                    <p
                      className="mt-4 text-sm font-medium truncate px-4"
                      style={{ color: "var(--foreground)" }}
                    >
                      {title}
                    </p>

                    <div className="mt-3 h-6">
                      <AnimatePresence mode="wait">
                        <motion.p
                          key={phase}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          className="text-sm"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {animDone && !link ? "Connecting to server…" : PHASES[phase]}
                        </motion.p>
                      </AnimatePresence>
                    </div>

                    {animDone && !link && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-3 flex justify-center gap-1"
                      >
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: "var(--neon-secondary)" }}
                            animate={{ opacity: [0.3, 1, 0.3] }}
                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                          />
                        ))}
                      </motion.div>
                    )}
                  </motion.div>
                )}

                {/* ── SCREEN 3: Done ────────────────────────────────────────── */}
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
                      <p
                        className="mt-1 text-sm font-medium truncate px-4"
                        style={{ color: "var(--foreground)" }}
                      >
                        {title}
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                        Share this link to invite others.
                      </p>
                    </div>

                    <div
                      className="flex items-center gap-2 rounded-xl p-3"
                      style={{
                        border: "1px solid var(--glass-border)",
                        background: "var(--glass)",
                      }}
                    >
                      <Link2
                        className="h-4 w-4 shrink-0"
                        style={{ color: "var(--neon-secondary)" }}
                      />
                      <code
                        className="flex-1 truncate text-xs text-left"
                        style={{ color: "var(--foreground)" }}
                      >
                        {link}
                      </code>
                      <button
                        onClick={copy}
                        className="rounded-lg px-2.5 py-1.5 text-xs font-medium transition flex items-center gap-1"
                        style={{
                          background: "var(--glass)",
                          border: "1px solid var(--glass-border)",
                          color: "var(--foreground)",
                        }}
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

      <DuplicateTitleModal
        open={dupModalOpen}
        conflictingTitle={dupConflictingTitle}
        onRetry={handleDupRetry}
        onClose={() => {
          setDupModalOpen(false);
          setDupConflictingTitle("");
          setScreen("title");
        }}
      />
    </>
  );
}
