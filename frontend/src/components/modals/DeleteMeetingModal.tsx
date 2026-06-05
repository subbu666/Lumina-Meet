/**
 * DeleteMeetingModal.tsx - Lumina Meet
 *
 * All previously-hardcoded oklch dark values have been replaced with the
 * CSS custom-property tokens defined in styles.css so the modal respects
 * both dark and light themes.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Trash2, X, ShieldAlert, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MeetingGroup } from "@/api/services/meetingService";

interface DeleteMeetingModalProps {
  open: boolean;
  meeting: MeetingGroup | null;
  onClose: () => void;
  onConfirm: (meetingId: string) => Promise<void>;
}

// ─── Particle canvas ──────────────────────────────────────────────────────────

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

    // Use the --neon-danger hue so it adapts to the theme
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
        // var(--neon-danger) resolves at runtime via getComputedStyle, but canvas
        // needs a concrete value. We read it once from the document root.
        const danger =
          getComputedStyle(document.documentElement).getPropertyValue("--neon-danger").trim() ||
          "oklch(0.72 0.22 35)";
        ctx!.fillStyle = danger;
        ctx!.shadowColor = danger;
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

// ─── Orbital loader ───────────────────────────────────────────────────────────

function OrbitalLoader() {
  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-transparent"
        style={{
          borderTopColor: "var(--neon-danger)",
          borderRightColor: "color-mix(in oklch, var(--neon-danger) 30%, transparent)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-3 rounded-full border-2 border-transparent"
        style={{
          borderBottomColor: "var(--neon-danger)",
          borderLeftColor: "color-mix(in oklch, var(--neon-danger) 30%, transparent)",
        }}
        animate={{ rotate: -360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{ background: "color-mix(in oklch, var(--neon-danger) 15%, transparent)" }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Trash2 className="h-4 w-4" style={{ color: "var(--neon-danger)" }} />
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
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{ borderColor: "color-mix(in oklch, var(--neon-danger) 50%, transparent)" }}
          initial={{ width: 40, height: 40, opacity: 0.8 }}
          animate={{ width: 80 + i * 28, height: 80 + i * 28, opacity: 0 }}
          transition={{ duration: 0.7, delay: i * 0.12, ease: "easeOut" }}
        />
      ))}
      <div
        className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--neon-danger) 25%, transparent), color-mix(in oklch, var(--neon-danger) 8%, transparent))",
          border: "1.5px solid color-mix(in oklch, var(--neon-danger) 60%, transparent)",
          boxShadow:
            "0 0 32px -6px color-mix(in oklch, var(--neon-danger) 70%, transparent), inset 0 0 12px color-mix(in oklch, var(--neon-danger) 10%, transparent)",
        }}
      >
        <motion.svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--foreground)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-7 h-7"
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

// ─── Badge ────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  instant: "Instant",
  scheduled: "Scheduled",
  joined: "Joined",
};

// ─── Main Modal ───────────────────────────────────────────────────────────────

type Phase = "idle" | "deleting" | "done";

export function DeleteMeetingModal({ open, meeting, onClose, onConfirm }: DeleteMeetingModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (open) setPhase("idle");
  }, [open]);

  const handleConfirm = async () => {
    if (!meeting) return;
    setPhase("deleting");
    try {
      await onConfirm(meeting.meetingId);
      setPhase("done");
      setTimeout(() => onClose(), 1600);
    } catch {
      setPhase("idle");
    }
  };

  const isIdle = phase === "idle";
  const isDeleting = phase === "deleting";
  const isDone = phase === "done";

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
              background: "color-mix(in oklch, var(--background) 88%, transparent)",
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
                background: "var(--card)",
                border: "1px solid color-mix(in oklch, var(--neon-danger) 22%, transparent)",
                boxShadow:
                  "0 0 0 1px color-mix(in oklch, var(--neon-danger) 8%, transparent), 0 32px 80px -16px color-mix(in oklch, var(--neon-danger) 35%, transparent), 0 8px 32px -8px color-mix(in oklch, var(--background) 70%, transparent)",
              }}
            >
              <DangerParticles active={isIdle} />

              {/* Top danger glow bar */}
              <motion.div
                className="absolute top-0 left-0 right-0 h-px"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, color-mix(in oklch, var(--neon-danger) 80%, transparent), var(--neon-danger), color-mix(in oklch, var(--neon-danger) 80%, transparent), transparent)",
                }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Corner accent */}
              <div
                className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle at top right, color-mix(in oklch, var(--neon-danger) 12%, transparent), transparent 70%)",
                }}
              />

              {/* ── Content ──────────────────────────────────────────────── */}
              <div className="relative z-10 p-7">
                {/* Close button */}
                <AnimatePresence>
                  {isIdle && (
                    <motion.button
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={onClose}
                      className="absolute top-5 right-5 flex h-7 w-7 items-center justify-center rounded-lg transition"
                      style={{
                        background: "var(--glass)",
                        border: "1px solid var(--glass-border)",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                  {/* ── IDLE ─────────────────────────────────────────────── */}
                  {isIdle && (
                    <motion.div
                      key="idle"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12, scale: 0.97 }}
                      transition={{ duration: 0.22 }}
                    >
                      <div className="flex items-start gap-4 mb-6">
                        <motion.div
                          className="shrink-0 flex h-13 w-13 items-center justify-center rounded-2xl"
                          style={{
                            background:
                              "radial-gradient(circle, color-mix(in oklch, var(--neon-danger) 20%, transparent), color-mix(in oklch, var(--neon-danger) 6%, transparent))",
                            border:
                              "1.5px solid color-mix(in oklch, var(--neon-danger) 40%, transparent)",
                            boxShadow:
                              "0 0 24px -4px color-mix(in oklch, var(--neon-danger) 50%, transparent), inset 0 1px 0 var(--glass)",
                          }}
                          animate={{
                            boxShadow: [
                              "0 0 24px -4px color-mix(in oklch, var(--neon-danger) 40%, transparent)",
                              "0 0 40px -4px color-mix(in oklch, var(--neon-danger) 70%, transparent)",
                              "0 0 24px -4px color-mix(in oklch, var(--neon-danger) 40%, transparent)",
                            ],
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <ShieldAlert
                            className="h-6 w-6"
                            style={{ color: "var(--neon-danger)" }}
                          />
                        </motion.div>

                        <div className="pt-0.5">
                          <h2
                            className="text-[17px] font-bold tracking-tight"
                            style={{ color: "var(--foreground)" }}
                          >
                            Delete this meeting?
                          </h2>
                          <p
                            className="mt-1 text-[13px] leading-relaxed"
                            style={{ color: "var(--muted-foreground)" }}
                          >
                            This action is{" "}
                            <span className="font-semibold" style={{ color: "var(--neon-danger)" }}>
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
                            "linear-gradient(135deg, color-mix(in oklch, var(--neon-danger) 7%, transparent), color-mix(in oklch, var(--neon-danger) 3%, transparent))",
                          border:
                            "1px solid color-mix(in oklch, var(--neon-danger) 18%, transparent)",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center"
                            style={{
                              background:
                                "color-mix(in oklch, var(--neon-danger) 12%, transparent)",
                              border:
                                "1px solid color-mix(in oklch, var(--neon-danger) 25%, transparent)",
                            }}
                          >
                            <Zap className="h-4 w-4" style={{ color: "var(--neon-danger)" }} />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p
                                className="font-semibold text-sm truncate"
                                style={{ color: "var(--foreground)" }}
                              >
                                {meeting.title}
                              </p>
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                                style={{
                                  background:
                                    "color-mix(in oklch, var(--neon-danger) 15%, transparent)",
                                  color: "var(--neon-danger)",
                                  border:
                                    "1px solid color-mix(in oklch, var(--neon-danger) 25%, transparent)",
                                }}
                              >
                                {TYPE_LABEL[meeting.type] ?? meeting.type}
                              </span>
                            </div>
                            <p
                              className="mt-0.5 font-mono text-[11px]"
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              {meeting.meetingId}
                            </p>
                          </div>
                        </div>

                        <div
                          className="my-3 h-px"
                          style={{
                            background: "color-mix(in oklch, var(--neon-danger) 10%, transparent)",
                          }}
                        />

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
                              style={{ color: "var(--muted-foreground)" }}
                            >
                              <span
                                className="shrink-0 h-1.5 w-1.5 rounded-full"
                                style={{
                                  background:
                                    "color-mix(in oklch, var(--neon-danger) 60%, transparent)",
                                }}
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
                          background: "color-mix(in oklch, var(--neon-danger) 6%, transparent)",
                          border:
                            "1px solid color-mix(in oklch, var(--neon-danger) 14%, transparent)",
                        }}
                      >
                        <AlertTriangle
                          className="h-3.5 w-3.5 shrink-0 mt-0.5"
                          style={{ color: "var(--neon-danger)" }}
                        />
                        <p
                          className="text-[12px] leading-relaxed"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Recordings stored on Cloudinary are{" "}
                          <span className="font-semibold" style={{ color: "var(--foreground)" }}>
                            not deleted
                          </span>{" "}
                          — only the meeting record is removed from Lumina Meet.
                        </p>
                      </div>

                      {/* Buttons */}
                      <div className="flex items-center gap-3">
                        <motion.button
                          onClick={onClose}
                          className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-150"
                          style={{
                            background: "var(--glass)",
                            border: "1px solid var(--glass-border)",
                            color: "var(--muted-foreground)",
                          }}
                          whileHover={{ opacity: 0.8 }}
                          whileTap={{ scale: 0.97 }}
                        >
                          Keep it
                        </motion.button>

                        <motion.button
                          onClick={handleConfirm}
                          className="flex-[1.6] relative overflow-hidden rounded-xl py-2.5 text-sm font-bold tracking-wide text-white"
                          style={{
                            background: "var(--destructive)",
                            boxShadow:
                              "0 4px 20px -6px color-mix(in oklch, var(--neon-danger) 70%, transparent), inset 0 1px 0 var(--glass)",
                          }}
                          whileHover={{ filter: "brightness(1.08)" }}
                          whileTap={{ scale: 0.97 }}
                        >
                          <motion.span
                            className="absolute inset-0 pointer-events-none"
                            style={{
                              background:
                                "linear-gradient(105deg, transparent 35%, color-mix(in oklch, white 10%, transparent) 50%, transparent 65%)",
                              backgroundSize: "200% 100%",
                            }}
                            animate={{ backgroundPosition: ["200% 0", "-200% 0"] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
                          />
                          <span className="relative z-10 flex items-center justify-center gap-2">
                            <Trash2 className="h-3.5 w-3.5" />
                            Yes, delete it
                          </span>
                        </motion.button>
                      </div>
                    </motion.div>
                  )}

                  {/* ── DELETING ──────────────────────────────────────────── */}
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
                        <p
                          className="text-base font-semibold"
                          style={{ color: "var(--foreground)" }}
                        >
                          Deleting meeting…
                        </p>
                        <p
                          className="text-[13px] mt-1"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          Erasing all records permanently
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[0, 1, 2, 3].map((i) => (
                          <motion.span
                            key={i}
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: "var(--neon-danger)" }}
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

                  {/* ── DONE ─────────────────────────────────────────────── */}
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
                          className="text-base font-bold"
                          style={{ color: "var(--foreground)" }}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                        >
                          Meeting deleted
                        </motion.p>
                        <motion.p
                          className="text-[13px] mt-1"
                          style={{ color: "var(--muted-foreground)" }}
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
                    "linear-gradient(90deg, transparent, color-mix(in oklch, var(--neon-danger) 40%, transparent), transparent)",
                }}
              />
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
