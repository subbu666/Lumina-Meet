/**
 * RenameMeetingModal.tsx
 *
 * Jaw-dropping, animated rename-meeting confirmation dialog.
 *
 * Flow:
 *   1. Opens showing the "confirmation" phase — title input pre-filled with
 *      current title, sparkle animation, neon aesthetics.
 *   2. User edits the title and clicks "Rename Meeting".
 *   3. Shows a "loading" phase while the API call is in flight.
 *   4. Shows a "success" phase with particle burst animation on success.
 *   5. On DUPLICATE_TITLE 409, shakes the input and shows an inline error.
 *
 * Usage:
 *   <RenameMeetingModal
 *     open={renameTarget !== null}
 *     meeting={renameTarget}          // MeetingGroup | null
 *     onClose={() => setRenameTarget(null)}
 *     onSuccess={(meetingId, newTitle) => { ... update local state ... }}
 *   />
 *
 * The component calls meetingService.renameMeeting() internally.
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

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = "idle" | "confirm" | "loading" | "success";

interface Props {
  open: boolean;
  meeting: MeetingGroup | null;
  onClose: () => void;
  /** Called after a successful rename so the parent can update local state */
  onSuccess: (meetingId: string, newTitle: string) => void;
}

// ─── Particle burst component ─────────────────────────────────────────────────

function ParticleBurst({ active }: { active: boolean }) {
  // 16 particles spread in a starburst
  const particles = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * 360;
    const distance = 55 + Math.random() * 40;
    const size = 3 + Math.random() * 5;
    const colors = [
      "oklch(0.65 0.22 280)", // indigo
      "oklch(0.75 0.18 305)", // violet
      "oklch(0.82 0.16 210)", // cyan
      "oklch(0.85 0.22 135)", // green
    ];
    const color = colors[i % colors.length];
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
          style={{
            width: p.size,
            height: p.size,
            background: p.color,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: p.tx,
            y: p.ty,
            opacity: 0,
            scale: 0,
          }}
          transition={{
            duration: 0.65,
            delay: p.delay,
            ease: [0.2, 0, 0.8, 1],
          }}
        />
      ))}
    </div>
  );
}

// ─── Orbiting ring component ──────────────────────────────────────────────────

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
      className="absolute rounded-full border border-[var(--neon-primary)]"
      style={{
        width: radius * 2,
        height: radius * 2,
        top: "50%",
        left: "50%",
        marginTop: -radius,
        marginLeft: -radius,
        opacity,
        borderStyle: dashed ? "dashed" : "solid",
      }}
      animate={{ rotate: dashed ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    />
  );
}

// ─── Badge type label ─────────────────────────────────────────────────────────

function MeetingTypePill({ type }: { type: "instant" | "scheduled" | "joined" }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    instant: {
      label: "Instant",
      cls: "bg-[oklch(0.65_0.22_320/0.12)] border-[oklch(0.65_0.22_320/0.25)] text-[var(--neon-accent)]",
    },
    scheduled: {
      label: "Scheduled",
      cls: "bg-[oklch(0.65_0.22_280/0.15)] border-[oklch(0.65_0.22_280/0.3)] text-[var(--neon-primary)]",
    },
    joined: {
      label: "Joined",
      cls: "bg-[oklch(0.82_0.16_210/0.12)] border-[oklch(0.82_0.16_210/0.25)] text-[var(--neon-secondary)]",
    },
  };
  const c = cfg[type] ?? cfg.instant;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        c.cls,
      )}
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

  // ── Sync title when meeting changes ─────────────────────────────────────────
  useEffect(() => {
    if (open && meeting) {
      setNewTitle(meeting.title);
      setDupError(null);
      setShake(false);
      setPhase("confirm");
      // Focus input after animation settles
      const t = setTimeout(() => inputRef.current?.focus(), 260);
      return () => clearTimeout(t);
    } else if (!open) {
      setPhase("idle");
    }
  }, [open, meeting]);

  const handleClose = () => {
    if (phase === "loading") return; // don't close while request is in flight
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

    // No-op guard
    if (trimmed.toLowerCase() === meeting.title.toLowerCase()) {
      onClose();
      return;
    }

    setDupError(null);
    setPhase("loading");

    try {
      await meetingService.renameMeeting(meeting.meetingId, trimmed);
      setPhase("success");

      // Show success briefly, then close and notify parent
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
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
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
              className={cn(
                "pointer-events-auto relative w-full max-w-md overflow-hidden rounded-3xl",
                "border border-white/10",
                "bg-[oklch(0.17_0.025_265)] shadow-[0_32px_80px_-8px_rgba(0,0,0,0.8),0_0_0_1px_oklch(0.65_0.22_280/0.15)]",
              )}
            >
              {/* ── Ambient top glow ────────────────────────────────────── */}
              <div
                className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full opacity-40"
                style={{
                  background:
                    "radial-gradient(ellipse, oklch(0.65 0.22 280 / 0.5) 0%, transparent 70%)",
                  filter: "blur(24px)",
                }}
              />

              {/* ── Close button ────────────────────────────────────────── */}
              {phase !== "loading" && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15 }}
                  onClick={handleClose}
                  className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </motion.button>
              )}

              {/* ════════════════════════════════════════════════════════ */}
              {/*  CONFIRM PHASE                                          */}
              {/* ════════════════════════════════════════════════════════ */}
              <AnimatePresence mode="wait">
                {(phase === "confirm" || phase === "loading") && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className="relative p-6 pb-7"
                  >
                    {/* ── Header ─────────────────────────────────────── */}
                    <div className="mb-6 flex flex-col items-center text-center">
                      {/* Icon with orbiting rings */}
                      <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
                        <OrbitRing radius={38} duration={12} opacity={0.18} />
                        <OrbitRing radius={30} duration={9} opacity={0.12} dashed />

                        {/* Core icon */}
                        <motion.div
                          animate={{
                            boxShadow: [
                              "0 0 20px oklch(0.65 0.22 280 / 0.4)",
                              "0 0 36px oklch(0.65 0.22 280 / 0.7)",
                              "0 0 20px oklch(0.65 0.22 280 / 0.4)",
                            ],
                          }}
                          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                          className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[oklch(0.65_0.22_280)] to-[oklch(0.75_0.18_305)]"
                        >
                          <Pencil className="h-6 w-6 text-white" />
                        </motion.div>
                      </div>

                      {/* Heading */}
                      <h2 className="mb-1.5 text-xl font-bold tracking-tight text-foreground">
                        Rename Meeting
                      </h2>
                      <p className="text-sm text-muted-foreground leading-relaxed max-w-[280px]">
                        Give your meeting a new name. Your link will stay exactly the same.
                      </p>
                    </div>

                    {/* ── Current meeting info pill ───────────────────── */}
                    <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-white/8 bg-white/3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-0.5">
                          Current title
                        </p>
                        <p className="text-sm font-semibold truncate text-muted-foreground">
                          {meeting.title}
                        </p>
                      </div>
                      <MeetingTypePill type={meeting.type} />
                    </div>

                    {/* ── New title input ──────────────────────────────── */}
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

                    {/* ── Char count ───────────────────────────────────── */}
                    <div className="mb-4 flex items-center justify-between px-1">
                      <AnimatePresence>
                        {dupError && (
                          <motion.div
                            initial={{ opacity: 0, y: -4, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: "auto" }}
                            exit={{ opacity: 0, y: -4, height: 0 }}
                            className="flex items-start gap-1.5"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[oklch(0.82_0.2_35)]" />
                            <p className="text-[11px] leading-snug text-[oklch(0.82_0.2_35)]">
                              {dupError}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <span
                        className={cn(
                          "ml-auto text-[11px] tabular-nums",
                          newTitle.length > 180
                            ? "text-[oklch(0.82_0.2_35)]"
                            : "text-muted-foreground/40",
                        )}
                      >
                        {newTitle.length}/200
                      </span>
                    </div>

                    {/* ── Link-unchanged notice ────────────────────────── */}
                    <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-[oklch(0.65_0.22_160/0.2)] bg-[oklch(0.65_0.22_160/0.06)] px-3.5 py-2.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-secondary)] shrink-0" />
                      <p className="text-[12px] text-[oklch(0.82_0.16_210/0.8)] leading-snug">
                        Your meeting link stays the same — no need to reshare it.
                      </p>
                    </div>

                    {/* ── Email notice ─────────────────────────────────── */}
                    <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-[oklch(0.65_0.22_280/0.2)] bg-[oklch(0.65_0.22_280/0.06)] px-3.5 py-2.5">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--neon-primary)]" />
                      <p className="text-[12px] text-[oklch(0.82_0.16_280/0.75)] leading-snug">
                        A confirmation email will be sent to you after renaming.
                      </p>
                    </div>

                    {/* ── Actions ──────────────────────────────────────── */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleClose}
                        disabled={phase === "loading"}
                        className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-white/8 hover:text-foreground disabled:opacity-40 active:scale-[0.97]"
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
                        className={cn(
                          "relative flex-[2] overflow-hidden rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all",
                          "bg-gradient-to-r from-[oklch(0.65_0.22_280)] to-[oklch(0.75_0.18_305)]",
                          "shadow-[0_6px_24px_-6px_oklch(0.65_0.22_280/0.6)]",
                          "hover:shadow-[0_8px_32px_-6px_oklch(0.65_0.22_280/0.8)]",
                          "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none",
                        )}
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
                {/*  SUCCESS PHASE                                          */}
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
                    {/* Particle burst */}
                    <ParticleBurst active />

                    {/* Success icon */}
                    <motion.div
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 18,
                        delay: 0.08,
                      }}
                      className="relative mb-6 flex h-20 w-20 items-center justify-center"
                    >
                      {/* Pulsing ring */}
                      <motion.div
                        className="absolute inset-0 rounded-full border-2 border-[oklch(0.75_0.18_145)]"
                        animate={{ scale: [1, 1.25, 1], opacity: [0.8, 0, 0.8] }}
                        transition={{ duration: 1.8, repeat: Infinity }}
                      />
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[oklch(0.65_0.22_160)] to-[oklch(0.75_0.18_145)] shadow-[0_0_32px_oklch(0.65_0.22_160/0.6)]">
                        <CheckCircle2 className="h-8 w-8 text-white" strokeWidth={2.5} />
                      </div>
                    </motion.div>

                    <motion.h2
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="mb-2 text-xl font-bold text-foreground"
                    >
                      Renamed!
                    </motion.h2>

                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mb-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5"
                    >
                      <span className="text-sm font-semibold text-[var(--neon-primary)]">
                        {newTitle}
                      </span>
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="text-[12px] text-muted-foreground"
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
