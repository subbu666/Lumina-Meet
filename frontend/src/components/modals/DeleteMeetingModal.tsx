/**
 * DeleteMeetingModal.tsx - Lumina Meet
 *
 * A cinematic, multi-phase confirmation dialog for permanent meeting deletion.
 *
 * Phases:
 *   "idle"     - danger warning, cancel / confirm buttons
 *   "deleting" - animated orbital loader with dissolving particles
 *   "done"     - success implosion with checkmark
 *
 * Design language: matches the oklch dark-glass aesthetic of the dashboard
 * - same CSS variables, same glass/border tokens, framer-motion throughout.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, X, ShieldAlert, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MeetingGroup } from "@/api/services/meetingService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeleteMeetingModalProps {
  open: boolean;
  meeting: MeetingGroup | null;
  onClose: () => void;
  /** Called when the user confirms. Should perform the API call and return a Promise. */
  onConfirm: (meetingId: string) => Promise<void>;
}

// ─── Particle canvas (ambient danger sparks) ─────────────────────────────────

function DangerParticles({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Danger colour in oklch(0.72 0.22 35) ≈ #f97316 orange-red
    const particles = Array.from({ length: 28 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 2 + 0.6,
      vx: (Math.random() - 0.5) * 0.6,
      vy: -(Math.random() * 0.8 + 0.2),
      alpha: Math.random() * 0.6 + 0.2,
      life: Math.random(),
    }));

    function tick() {
      ctx!.clearRect(0, 0, W, H);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.004;
        if (p.life <= 0) {
          p.x = Math.random() * W;
          p.y = H + 4;
          p.life = 1;
          p.alpha = Math.random() * 0.6 + 0.2;
        }
        ctx!.save();
        ctx!.globalAlpha = p.alpha * p.life;
        ctx!.fillStyle = `oklch(0.82 0.22 35)`;
        ctx!.shadowColor = `oklch(0.72 0.22 35)`;
        ctx!.shadowBlur = 8;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={320}
      className="pointer-events-none absolute inset-0 w-full h-full opacity-60"
    />
  );
}

// ─── Orbital loader (deleting phase) ─────────────────────────────────────────

function OrbitalLoader() {
  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      {/* Outer ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-transparent"
        style={{
          borderTopColor: "oklch(0.72 0.22 35)",
          borderRightColor: "oklch(0.72 0.22 35 / 0.3)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
      {/* Mid ring - counter */}
      <motion.div
        className="absolute inset-3 rounded-full border-2 border-transparent"
        style={{
          borderBottomColor: "oklch(0.82 0.2 35)",
          borderLeftColor: "oklch(0.82 0.2 35 / 0.3)",
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      />
      {/* Inner pulse */}
      <motion.div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: "oklch(0.72 0.22 35 / 0.15)" }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Trash2 className="h-4 w-4" style={{ color: "oklch(0.82 0.2 35)" }} />
      </motion.div>
    </div>
  );
}

// ─── Success burst ────────────────────────────────────────────────────────────

function SuccessBurst() {
  return (
    <motion.div
      className="relative flex items-center justify-center w-24 h-24"
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      {/* Radial burst rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{ borderColor: "oklch(0.82 0.2 35 / 0.5)" }}
          initial={{ width: 40, height: 40, opacity: 0.8 }}
          animate={{ width: 80 + i * 28, height: 80 + i * 28, opacity: 0 }}
          transition={{
            duration: 0.7,
            delay: i * 0.12,
            ease: "easeOut",
          }}
        />
      ))}
      {/* Checkmark circle */}
      <div
        className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background:
            "radial-gradient(circle, oklch(0.72 0.22 35 / 0.25), oklch(0.72 0.22 35 / 0.08))",
          border: "1.5px solid oklch(0.82 0.2 35 / 0.6)",
          boxShadow:
            "0 0 32px -6px oklch(0.72 0.22 35 / 0.7), inset 0 0 12px oklch(0.72 0.22 35 / 0.1)",
        }}
      >
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="oklch(0.92 0.15 35)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-7 h-7"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        >
          <motion.path
            d="M5 13l4 4L19 7"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          />
        </motion.svg>
      </div>
    </motion.div>
  );
}

// ─── Badge for meeting type ───────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  instant: "Instant",
  scheduled: "Scheduled",
  joined: "Joined",
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

type Phase = "idle" | "deleting" | "done";

export function DeleteMeetingModal({ open, meeting, onClose, onConfirm }: DeleteMeetingModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");

  // Reset phase whenever the modal opens
  useEffect(() => {
    if (open) setPhase("idle");
  }, [open]);

  const handleConfirm = async () => {
    if (!meeting) return;
    setPhase("deleting");
    try {
      await onConfirm(meeting.meetingId);
      setPhase("done");
      // Auto-close after success animation
      setTimeout(() => onClose(), 1600);
    } catch {
      // On error fall back to idle so user can retry or cancel
      setPhase("idle");
    }
  };

  const isIdle = phase === "idle";
  const isDeleting = phase === "deleting";
  const isDone = phase === "done";

  // Prevent closing during active deletion
  const handleBackdropClick = () => {
    if (isDeleting) return;
    onClose();
  };

  return (
    <AnimatePresence>
      {open && meeting && (
        <>
          {/* ── Backdrop ─────────────────────────────────────────────────── */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{
              background: "oklch(0.08 0.02 265 / 0.88)",
              backdropFilter: "blur(14px) saturate(160%)",
              WebkitBackdropFilter: "blur(14px) saturate(160%)",
            }}
            onClick={handleBackdropClick}
          >
            {/* ── Modal card ─────────────────────────────────────────────── */}
            <motion.div
              key="card"
              initial={{ opacity: 0, scale: 0.88, y: 28 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.88, y: 28 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[440px] overflow-hidden rounded-3xl"
              style={{
                background:
                  "linear-gradient(160deg, oklch(0.2 0.025 265 / 0.97) 0%, oklch(0.17 0.02 265 / 0.99) 100%)",
                border: "1px solid oklch(0.72 0.22 35 / 0.22)",
                boxShadow:
                  "0 0 0 1px oklch(0.72 0.22 35 / 0.08), 0 32px 80px -16px oklch(0.72 0.22 35 / 0.35), 0 8px 32px -8px oklch(0 0 0 / 0.7)",
              }}
            >
              {/* Ambient particle canvas */}
              <DangerParticles active={isIdle} />

              {/* Top danger glow bar */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, oklch(0.82 0.22 35 / 0.8), oklch(0.72 0.22 35), oklch(0.82 0.22 35 / 0.8), transparent)",
                }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Corner accent: top-right */}
              <div
                className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle at top right, oklch(0.72 0.22 35 / 0.12), transparent 70%)",
                }}
              />

              {/* ── Content ──────────────────────────────────────────────── */}
              <div className="relative z-10 p-7">
                {/* Close button - only in idle */}
                <AnimatePresence>
                  {isIdle && (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={onClose}
                      className="absolute top-5 right-5 flex h-7 w-7 items-center justify-center rounded-lg transition"
                      style={{
                        background: "oklch(1 0 0 / 0.05)",
                        border: "1px solid oklch(1 0 0 / 0.08)",
                        color: "oklch(0.7 0.03 260)",
                      }}
                      whileHover={{
                        background: "oklch(0.72 0.22 35 / 0.12)",
                        borderColor: "oklch(0.72 0.22 35 / 0.3)",
                        color: "oklch(0.82 0.2 35)",
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>

                {/* ── Phase: IDLE ─────────────────────────────────────────── */}
                <AnimatePresence mode="wait">
                  {isIdle && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12, scale: 0.97 }}
                      transition={{ duration: 0.22 }}
                    >
                      {/* Icon header */}
                      <div className="flex items-start gap-4 mb-6">
                        <motion.div
                          className="shrink-0 flex h-13 w-13 items-center justify-center rounded-2xl"
                          style={{
                            background:
                              "radial-gradient(circle, oklch(0.72 0.22 35 / 0.2), oklch(0.72 0.22 35 / 0.06))",
                            border: "1.5px solid oklch(0.72 0.22 35 / 0.4)",
                            boxShadow:
                              "0 0 24px -4px oklch(0.72 0.22 35 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.08)",
                          }}
                          animate={{
                            boxShadow: [
                              "0 0 24px -4px oklch(0.72 0.22 35 / 0.4)",
                              "0 0 40px -4px oklch(0.72 0.22 35 / 0.7)",
                              "0 0 24px -4px oklch(0.72 0.22 35 / 0.4)",
                            ],
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <ShieldAlert
                            className="h-6 w-6"
                            style={{ color: "oklch(0.87 0.18 35)" }}
                          />
                        </motion.div>

                        <div className="pt-0.5">
                          <h2 className="text-[17px] font-bold tracking-tight text-white">
                            Delete this meeting?
                          </h2>
                          <p
                            className="mt-1 text-[13px] leading-relaxed"
                            style={{ color: "oklch(0.7 0.03 260)" }}
                          >
                            This action is{" "}
                            <span
                              className="font-semibold"
                              style={{ color: "oklch(0.87 0.18 35)" }}
                            >
                              permanent
                            </span>{" "}
                            and cannot be undone.
                          </p>
                        </div>
                      </div>

                      {/* Meeting preview card */}
                      <div
                        className="mb-6 rounded-2xl p-4"
                        style={{
                          background:
                            "linear-gradient(135deg, oklch(0.72 0.22 35 / 0.07), oklch(0.72 0.22 35 / 0.03))",
                          border: "1px solid oklch(0.72 0.22 35 / 0.18)",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          {/* Meeting icon */}
                          <div
                            className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center"
                            style={{
                              background: "oklch(0.72 0.22 35 / 0.12)",
                              border: "1px solid oklch(0.72 0.22 35 / 0.25)",
                            }}
                          >
                            <Zap className="h-4 w-4" style={{ color: "oklch(0.87 0.18 35)" }} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate text-white">
                                {meeting.title}
                              </p>
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                                style={{
                                  background: "oklch(0.72 0.22 35 / 0.15)",
                                  color: "oklch(0.87 0.18 35)",
                                  border: "1px solid oklch(0.72 0.22 35 / 0.25)",
                                }}
                              >
                                {TYPE_LABEL[meeting.type] ?? meeting.type}
                              </span>
                            </div>
                            <p
                              className="mt-0.5 font-mono text-[11px]"
                              style={{ color: "oklch(0.6 0.03 260)" }}
                            >
                              {meeting.meetingId}
                            </p>
                          </div>
                        </div>

                        {/* Divider */}
                        <div
                          className="my-3 h-px"
                          style={{ background: "oklch(0.72 0.22 35 / 0.1)" }}
                        />

                        {/* What gets deleted list */}
                        <ul className="space-y-1.5">
                          {[
                            "All session history & usage stats",
                            "Participant records & invite list",
                            "Meeting link (no longer joinable)",
                            ...(meeting.sessionCount > 0
                              ? [
                                  `Total ${meeting.sessionCount} session${meeting.sessionCount !== 1 ? "s" : ""}`,
                                ]
                              : []),
                          ].map((item) => (
                            <li
                              key={item}
                              className="flex items-center gap-2 text-[12px]"
                              style={{ color: "oklch(0.65 0.04 260)" }}
                            >
                              <span
                                className="shrink-0 h-1.5 w-1.5 rounded-full"
                                style={{ background: "oklch(0.72 0.22 35 / 0.6)" }}
                              />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Warning note */}
                      <div
                        className="mb-6 flex items-start gap-2.5 rounded-xl px-3.5 py-3"
                        style={{
                          background: "oklch(0.72 0.22 35 / 0.06)",
                          border: "1px solid oklch(0.72 0.22 35 / 0.14)",
                        }}
                      >
                        <AlertTriangle
                          className="h-3.5 w-3.5 shrink-0 mt-0.5"
                          style={{ color: "oklch(0.82 0.2 35)" }}
                        />
                        <p
                          className="text-[12px] leading-relaxed"
                          style={{ color: "oklch(0.72 0.12 35)" }}
                        >
                          Recordings stored on Cloudinary are{" "}
                          <span className="font-semibold text-white/80">not deleted</span> - only
                          the meeting record is removed from Lumina Meet.
                        </p>
                      </div>

                      {/* Buttons */}
                      <div className="flex items-center gap-3">
                        {/* Cancel */}
                        <motion.button
                          onClick={onClose}
                          className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-150"
                          style={{
                            background: "oklch(1 0 0 / 0.05)",
                            border: "1px solid oklch(1 0 0 / 0.1)",
                            color: "oklch(0.7 0.03 260)",
                          }}
                          whileHover={{
                            background: "oklch(1 0 0 / 0.09)",
                            borderColor: "oklch(1 0 0 / 0.18)",
                            color: "oklch(0.92 0.01 260)",
                          }}
                          whileTap={{ scale: 0.97 }}
                        >
                          Keep it
                        </motion.button>

                        {/* Confirm delete */}
                        <motion.button
                          onClick={handleConfirm}
                          className="flex-[1.6] relative overflow-hidden rounded-xl py-2.5 text-sm font-bold tracking-wide"
                          style={{
                            background:
                              "linear-gradient(135deg, oklch(0.6 0.25 30), oklch(0.52 0.22 20))",
                            boxShadow:
                              "0 4px 20px -6px oklch(0.72 0.22 35 / 0.7), inset 0 1px 0 oklch(1 0 0 / 0.15)",
                            color: "#fff",
                          }}
                          whileHover={{
                            boxShadow:
                              "0 6px 32px -6px oklch(0.72 0.22 35 / 0.9), inset 0 1px 0 oklch(1 0 0 / 0.2)",
                            filter: "brightness(1.08)",
                          }}
                          whileTap={{ scale: 0.97 }}
                        >
                          {/* Shimmer on hover */}
                          <motion.span
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background:
                                "linear-gradient(105deg, transparent 35%, oklch(1 0 0 / 0.1) 50%, transparent 65%)",
                              backgroundSize: "200% 100%",
                            }}
                            animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
                            transition={{
                              duration: 2.5,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                          />
                          <span className="relative z-10 flex items-center justify-center gap-2">
                            <Trash2 className="h-3.5 w-3.5" />
                            Yes, delete it
                          </span>
                        </motion.button>
                      </div>
                    </motion.div>
                  )}

                  {/* ── Phase: DELETING ──────────────────────────────────── */}
                  {isDeleting && (
                    <motion.div
                      key="deleting"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.25 }}
                      className="flex flex-col items-center justify-center py-10 gap-5 text-center"
                    >
                      <OrbitalLoader />
                      <div>
                        <p className="text-base font-semibold text-white">Deleting meeting…</p>
                        <p className="text-[13px] mt-1" style={{ color: "oklch(0.65 0.03 260)" }}>
                          Erasing all records permanently
                        </p>
                      </div>
                      {/* Animated progress dots */}
                      <div className="flex items-center gap-1.5">
                        {[0, 1, 2, 3].map((i) => (
                          <motion.span
                            key={i}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: "oklch(0.72 0.22 35)" }}
                            animate={{ opacity: [0.2, 1, 0.2], scale: [0.7, 1.2, 0.7] }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              delay: i * 0.18,
                              ease: "easeInOut",
                            }}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* ── Phase: DONE ──────────────────────────────────────── */}
                  {isDone && (
                    <motion.div
                      key="done"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="flex flex-col items-center justify-center py-10 gap-5 text-center"
                    >
                      <SuccessBurst />
                      <div>
                        <motion.p
                          className="text-base font-bold text-white"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                        >
                          Meeting deleted
                        </motion.p>
                        <motion.p
                          className="text-[13px] mt-1"
                          style={{ color: "oklch(0.65 0.03 260)" }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.35 }}
                        >
                          Gone without a trace
                        </motion.p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom glow line */}
              <motion.div
                className="absolute bottom-0 left-0 right-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, oklch(0.72 0.22 35 / 0.4), transparent)",
                }}
              />
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
