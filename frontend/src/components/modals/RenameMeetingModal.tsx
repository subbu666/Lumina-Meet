/**
 * RenameMeetingModal.tsx
 *
 * All previously-hardcoded oklch dark values replaced with CSS custom-property
 * tokens from styles.css so this modal correctly adapts to light/dark themes.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Sparkles, CheckCircle2, X, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  meetingService,
  extractDuplicateTitle,
  type MeetingGroup,
} from "@/api/services/meetingService";
import { extractError } from "@/api/apiClient";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";

type Phase = "idle" | "confirm" | "loading" | "success";

interface Props {
  open: boolean;
  meeting: MeetingGroup | null;
  onClose: () => void;
  onSuccess: (meetingId: string, newTitle: string) => void;
}

// ─── Particle burst ───────────────────────────────────────────────────────────

function ParticleBurst({ active }: { active: boolean }) {
  const particles = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * 360;
    const distance = 55 + Math.random() * 40;
    const size = 3 + Math.random() * 5;
    // Use CSS variable names — they resolve at render time via inline style
    const colorVars = [
      "var(--neon-primary)",
      "var(--neon-accent)",
      "var(--neon-secondary)",
      "var(--neon-secondary)",
    ];
    const color = colorVars[i % colorVars.length];
    const rad = (angle * Math.PI) / 180;
    const tx = Math.cos(rad) * distance;
    const ty = Math.sin(rad) * distance;
    const delay = Math.random() * 0.12;
    return { tx, ty, size, color, delay };
  });

  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, background: p.color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: p.tx, y: p.ty, opacity: 0, scale: 0 }}
          transition={{ duration: 0.65, delay: p.delay, ease: [0.2, 0, 0.8, 1] }}
        />
      ))}
    </div>
  );
}

// ─── Orbiting ring ────────────────────────────────────────────────────────────

function OrbitRing({
  radius,
  duration,
  opacity,
  dashed,
}: {
  radius: number;
  duration: number;
  opacity: number;
  dashed?: boolean;
}) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: radius * 2,
        height: radius * 2,
        top: "50%",
        left: "50%",
        marginTop: -radius,
        marginLeft: -radius,
        opacity,
        borderStyle: dashed ? "dashed" : "solid",
        border: "1px solid var(--neon-primary)",
      }}
      animate={{ rotate: dashed ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    />
  );
}

// ─── Meeting type pill ────────────────────────────────────────────────────────

function MeetingTypePill({ type }: { type: "instant" | "scheduled" | "joined" }) {
  const cfg: Record<string, { label: string; colorVar: string }> = {
    instant: { label: "Instant", colorVar: "var(--neon-accent)" },
    scheduled: { label: "Scheduled", colorVar: "var(--neon-primary)" },
    joined: { label: "Joined", colorVar: "var(--neon-secondary)" },
  };
  const c = cfg[type] ?? cfg.instant;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        background: "color-mix(in oklch, " + c.colorVar + " 12%, transparent)",
        border: "1px solid color-mix(in oklch, " + c.colorVar + " 25%, transparent)",
        color: c.colorVar,
      }}
    >
      {c.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function RenameMeetingModal({ open, meeting, onClose, onSuccess }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [newTitle, setNewTitle] = useState("");
  const [dupError, setDupError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && meeting) {
      setNewTitle(meeting.title);
      setDupError(null);
      setShake(false);
      setPhase("confirm");
      const t = setTimeout(() => inputRef.current?.focus(), 260);
      return () => clearTimeout(t);
    } else if (!open) {
      setPhase("idle");
    }
  }, [open, meeting]);

  const handleClose = () => {
    if (phase === "loading") return;
    onClose();
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSubmit = async () => {
    if (!meeting) return;
    const trimmed = newTitle.trim();

    if (!trimmed) {
      setDupError("Meeting title cannot be empty.");
      triggerShake();
      inputRef.current?.focus();
      return;
    }
    if (trimmed.length > 200) {
      setDupError("Title cannot exceed 200 characters.");
      triggerShake();
      return;
    }
    if (trimmed.toLowerCase() === meeting.title.toLowerCase()) {
      onClose();
      return;
    }

    setDupError(null);
    setPhase("loading");

    try {
      await meetingService.renameMeeting(meeting.meetingId, trimmed);
      setPhase("success");
      setTimeout(() => {
        onSuccess(meeting.meetingId, trimmed);
        onClose();
        toast.success(`Meeting renamed to "${trimmed}"`, {
          description: "A confirmation email has been sent to you.",
        });
      }, 1800);
    } catch (err) {
      const dup = extractDuplicateTitle(err);
      if (dup) {
        setPhase("confirm");
        setDupError(`You already have a meeting titled "${dup}". Please choose a different title.`);
        triggerShake();
        inputRef.current?.focus();
      } else {
        setPhase("confirm");
        const { message } = extractError(err);
        toast.error(message || "Failed to rename meeting. Please try again.");
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") handleClose();
  };

  return (
    <AnimatePresence>
      {open && meeting && (
        <>
          {/* ── Backdrop ──────────────────────────────────────────────────── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-50 backdrop-blur-sm"
            style={{ background: "color-mix(in oklch, var(--background) 60%, transparent)" }}
            onClick={handleClose}
          />

          {/* ── Dialog ────────────────────────────────────────────────────── */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="dialog"
              initial={{ opacity: 0, scale: 0.88, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: "spring", stiffness: 360, damping: 28, mass: 0.8 }}
              className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-3xl"
              style={{
                background: "var(--card)",
                border: "1px solid var(--glass-border-strong)",
                boxShadow:
                  "0 32px 80px -8px color-mix(in oklch, var(--background) 80%, transparent), 0 0 0 1px color-mix(in oklch, var(--neon-primary) 15%, transparent)",
              }}
            >
              {/* ── Ambient top glow ─────────────────────────────────────── */}
              <div
                className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full opacity-40"
                style={{
                  background:
                    "radial-gradient(ellipse, color-mix(in oklch, var(--neon-primary) 50%, transparent) 0%, transparent 70%)",
                  filter: "blur(24px)",
                }}
              />

              {/* ── Close button ─────────────────────────────────────────── */}
              {phase !== "loading" && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15 }}
                  onClick={handleClose}
                  className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full transition"
                  style={{
                    border: "1px solid var(--glass-border)",
                    background: "var(--glass)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  <X className="h-4 w-4" />
                </motion.button>
              )}

              <AnimatePresence mode="wait">
                {/* ════════════════════════════════════════════════════════ */}
                {/* CONFIRM / LOADING PHASE                                 */}
                {/* ════════════════════════════════════════════════════════ */}
                {(phase === "confirm" || phase === "loading") && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="relative p-6 pb-7"
                  >
                    {/* Header */}
                    <div className="mb-6 flex flex-col items-center text-center">
                      <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
                        <OrbitRing radius={38} duration={12} opacity={0.18} />
                        <OrbitRing radius={30} duration={9} opacity={0.12} dashed />

                        <motion.div
                          animate={{
                            boxShadow: [
                              "0 0 20px color-mix(in oklch, var(--neon-primary) 40%, transparent)",
                              "0 0 36px color-mix(in oklch, var(--neon-primary) 70%, transparent)",
                              "0 0 20px color-mix(in oklch, var(--neon-primary) 40%, transparent)",
                            ],
                          }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                          className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-neon"
                        >
                          <Pencil className="h-6 w-6 text-white" />
                        </motion.div>
                      </div>

                      <h2
                        className="mb-1.5 text-xl font-bold tracking-tight"
                        style={{ color: "var(--foreground)" }}
                      >
                        Rename Meeting
                      </h2>
                      <p
                        className="text-sm leading-relaxed max-w-[280px]"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        Give your meeting a new name. Your link will stay exactly the same.
                      </p>
                    </div>

                    {/* Current meeting info */}
                    <div
                      className="mb-5 flex items-center gap-2.5 rounded-2xl px-4 py-3"
                      style={{
                        border: "1px solid var(--glass-border)",
                        background: "var(--glass)",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Current title
                        </p>
                        <p
                          className="text-sm font-semibold truncate"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {meeting.title}
                        </p>
                      </div>
                      <MeetingTypePill type={meeting.type} />
                    </div>

                    {/* New title input */}
                    <motion.div
                      animate={shake ? { x: [-6, 6, -5, 5, -3, 3, 0] } : {}}
                      transition={{ duration: 0.45 }}
                      className="mb-2"
                    >
                      <FloatingInput
                        ref={inputRef}
                        label="New meeting title"
                        value={newTitle}
                        onChange={(e) => {
                          setNewTitle(e.target.value);
                          if (dupError) setDupError(null);
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder=" "
                        maxLength={200}
                        disabled={phase === "loading"}
                      />
                    </motion.div>

                    {/* Char count + error */}
                    <div className="mb-4 flex items-center justify-between px-1">
                      <AnimatePresence>
                        {dupError && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: "auto" }}
                            exit={{ opacity: 0, y: -4, height: 0 }}
                            className="flex items-start gap-1.5"
                          >
                            <AlertTriangle
                              className="h-3.5 w-3.5 shrink-0 mt-0.5"
                              style={{ color: "var(--neon-danger)" }}
                            />
                            <p
                              className="text-[11px] leading-snug"
                              style={{ color: "var(--neon-danger)" }}
                            >
                              {dupError}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <span
                        className="ml-auto text-[11px] tabular-nums"
                        style={{
                          color:
                            newTitle.length > 180
                              ? "var(--neon-danger)"
                              : "var(--muted-foreground)",
                        }}
                      >
                        {newTitle.length}/200
                      </span>
                    </div>

                    {/* Link-unchanged notice */}
                    <div
                      className="mb-5 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
                      style={{
                        border:
                          "1px solid color-mix(in oklch, var(--neon-secondary) 20%, transparent)",
                        background: "color-mix(in oklch, var(--neon-secondary) 6%, transparent)",
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ background: "var(--neon-secondary)" }}
                      />
                      <p
                        className="text-[12px] leading-snug"
                        style={{ color: "var(--neon-secondary)" }}
                      >
                        Your meeting link stays the same — no need to reshare it.
                      </p>
                    </div>

                    {/* Email notice */}
                    <div
                      className="mb-6 flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
                      style={{
                        border:
                          "1px solid color-mix(in oklch, var(--neon-primary) 20%, transparent)",
                        background: "color-mix(in oklch, var(--neon-primary) 6%, transparent)",
                      }}
                    >
                      <Sparkles
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: "var(--neon-primary)" }}
                      />
                      <p
                        className="text-[12px] leading-snug"
                        style={{ color: "var(--neon-primary)" }}
                      >
                        A confirmation email will be sent to you after renaming.
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleClose}
                        disabled={phase === "loading"}
                        className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-40 active:scale-[0.97]"
                        style={{
                          border: "1px solid var(--glass-border)",
                          background: "var(--glass)",
                          color: "var(--muted-foreground)",
                        }}
                      >
                        Cancel
                      </button>

                      <motion.button
                        onClick={handleSubmit}
                        disabled={
                          phase === "loading" ||
                          !newTitle.trim() ||
                          newTitle.trim().toLowerCase() === meeting.title.toLowerCase()
                        }
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        className="relative flex-[2] overflow-hidden rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all bg-gradient-neon glow-primary disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {/* Shimmer sweep */}
                        <motion.div
                          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                          initial={{ x: "-100%" }}
                          animate={{ x: "200%" }}
                          transition={{
                            duration: 1.8,
                            repeat: Infinity,
                            repeatDelay: 2.5,
                            ease: "easeInOut",
                          }}
                        />

                        {phase === "loading" ? (
                          <span className="flex items-center justify-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Renaming…
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-2">
                            <Pencil className="h-3.5 w-3.5" />
                            Rename Meeting
                          </span>
                        )}
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {/* ════════════════════════════════════════════════════════ */}
                {/* SUCCESS PHASE                                           */}
                {/* ════════════════════════════════════════════════════════ */}
                {phase === "success" && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 22 }}
                    className="relative flex flex-col items-center px-8 py-12 text-center"
                  >
                    <ParticleBurst active />

                    <motion.div
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.08 }}
                      className="relative mb-6 flex h-20 w-20 items-center justify-center"
                    >
                      <motion.div
                        className="absolute inset-0 rounded-full border-2"
                        style={{
                          borderColor:
                            "color-mix(in oklch, var(--neon-secondary) 75%, transparent)",
                        }}
                        animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0, 0.8] }}
                        transition={{ duration: 1.8, repeat: Infinity }}
                      />
                      <div
                        className="flex h-16 w-16 items-center justify-center rounded-2xl"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--neon-secondary), var(--neon-primary))",
                          boxShadow:
                            "0 0 32px color-mix(in oklch, var(--neon-secondary) 60%, transparent)",
                        }}
                      >
                        <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
                      </div>
                    </motion.div>

                    <motion.h2
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="mb-2 text-xl font-bold"
                      style={{ color: "var(--foreground)" }}
                    >
                      Renamed!
                    </motion.h2>

                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mb-2 flex items-center gap-2 rounded-2xl px-4 py-2.5"
                      style={{
                        border: "1px solid var(--glass-border)",
                        background: "var(--glass)",
                      }}
                    >
                      <span
                        className="text-sm font-semibold"
                        style={{ color: "var(--neon-primary)" }}
                      >
                        {newTitle}
                      </span>
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="text-[12px]"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      Check your email for a confirmation ✨
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
