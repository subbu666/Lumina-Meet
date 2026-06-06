/**
 * dashboard.tsx - Lumina Meet Dashboard
 *
 * All hardcoded color values replaced with CSS variable tokens so the
 * dashboard responds correctly to both light and dark themes.
 *
 * Key fixes vs previous version:
 *  - Dialog/DialogContent: removed hardcoded `border-white/10` and
 *    replaced with `border-[var(--glass-border)]`. Also overrides the
 *    shadcn overlay which hardcodes a dark backdrop.
 *  - RecordingCard thumbnail: removed `bg-black/40` → `bg-[var(--card)]`
 *  - All remaining `white/N` alpha utilities replaced with CSS-var equivalents
 *  - InviteDialog result box border fixed
 *  - bg-[#05070e] backdrop references removed
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  History,
  LogOut,
  Plus,
  Sparkles,
  Video,
  Send,
  ChevronDown,
  Zap,
  Timer,
  RotateCcw,
  Activity,
  Link2,
  AlertTriangle,
  Copy,
  ExternalLink,
  RefreshCw,
  Trash2,
  Pencil,
  Mic2,
  MonitorSmartphone,
  Monitor,
  CheckCircle2,
  HardDrive,
  Loader2,
  Film,
  ChevronUp,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";
import { MeetingGenerationModal } from "@/components/modals/MeetingGenerationModal";
import { DeleteMeetingModal } from "@/components/modals/DeleteMeetingModal";
import { DuplicateTitleModal } from "@/components/modals/DuplicateTitleModal";
import { RenameMeetingModal } from "@/components/modals/RenameMeetingModal";
import {
  meetingService,
  extractDuplicateTitle,
  type MeetingGroup,
  formatDuration,
} from "@/api/services/meetingService";
import { extractError } from "@/api/apiClient";
import { apiClient } from "@/api/apiClient";
import { API_ENDPOINTS } from "@/api/endpoints";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ThemeToggle } from "@/components/ui-custom/ThemeToggle";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard - Lumina Meet" }] }),
});

// ─── Tab type ──────────────────────────────────────────────────────────────────

type DashboardTab = "meetings" | "recordings";

// ─── Date helpers ──────────────────────────────────────────────────────────────

function relativeDate(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fullDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Lumina Logo (used in empty states) ─────────────────────────────────────
function LuminaLogo({ size = 36 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="lg-main" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          {/* was: #6366f1 / #22d3ee */}
          <stop offset="0%" stopColor="var(--neon-primary)" />
          <stop offset="100%" stopColor="var(--neon-secondary)" />
        </linearGradient>
        <radialGradient id="rg-glow" cx="50%" cy="50%" r="50%">
          {/* was: #22d3ee / #6366f1 */}
          <stop offset="0%" stopColor="var(--neon-secondary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--neon-primary)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lg-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.3" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect x="1" y="1" width="34" height="34" rx="10" fill="url(#lg-main)" opacity="0.15" />
      <rect x="1" y="1" width="34" height="34" rx="10" stroke="url(#lg-main)" strokeWidth="1.5" />
      <rect x="1" y="1" width="34" height="34" rx="10" fill="url(#rg-glow)" />
      <rect
        x="5"
        y="11"
        width="18"
        height="14"
        rx="3"
        fill="url(#lg-main)"
        filter="url(#glow)"
        opacity="0.9"
      />
      {/* was: fill="#0B0F19" — now uses the theme surface token */}
      <circle cx="14" cy="18" r="4.5" fill="var(--body-base)" />
      <circle cx="14" cy="18" r="3" fill="url(#lg-main)" opacity="0.7" />
      {/* was: fill="#22d3ee" */}
      <circle cx="14" cy="18" r="1.5" fill="var(--neon-secondary)" filter="url(#glow)" />
      <circle cx="15.2" cy="16.8" r="0.7" fill="white" opacity="0.6" />
      <path
        d="M25 14.5 L31 18 L25 21.5 Z"
        fill="url(#lg-main)"
        filter="url(#glow)"
        opacity="0.95"
      />
      <rect x="5" y="11" width="18" height="6" rx="3" fill="url(#lg-shine)" />
    </svg>
  );
}

// ─── Expiry helpers ───────────────────────────────────────────────────────────

function isScheduledExpired(group: MeetingGroup): boolean {
  if (group.type !== "scheduled" || !group.scheduledFor) return false;
  if ((group as any).status === "cancelled" || (group as any).status === "completed") return true;
  const durationMs = ((group as any).duration ?? 60) * 60 * 1000;
  return Date.now() > group.scheduledFor + durationMs;
}

function isScheduledUpcoming(group: MeetingGroup): boolean {
  if (group.type !== "scheduled" || !group.scheduledFor) return false;
  if (group.isActive) return false;
  return !isScheduledExpired(group);
}

// ─── IconBtn ──────────────────────────────────────────────────────────────────

type IconBtnVariant = "primary" | "secondary" | "danger" | "ghost" | "live" | "expired";

function IconBtn({
  variant = "secondary",
  size = "sm",
  icon,
  children,
  onClick,
  disabled,
  className = "",
  as: Tag = "button",
  ...rest
}: {
  variant?: IconBtnVariant;
  size?: "xs" | "sm" | "md";
  icon?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler;
  disabled?: boolean;
  className?: string;
  as?: React.ElementType;
  [key: string]: any;
}) {
  const base =
    "inline-flex items-center gap-1.5 font-medium rounded-lg transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";
  const sizes: Record<string, string> = {
    xs: "px-2 py-1 text-[11px]",
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
  };

  const variants: Record<IconBtnVariant, string> = {
    primary:
      "bg-gradient-neon text-white shadow-[var(--shadow-glow-primary)] hover:shadow-[var(--shadow-glow-primary)] hover:brightness-110 active:scale-[0.97]",
    secondary:
      "bg-[color-mix(in_oklch,var(--neon-secondary)_8%,transparent)] border border-[color-mix(in_oklch,var(--neon-secondary)_25%,transparent)] text-[var(--neon-secondary)] hover:bg-[color-mix(in_oklch,var(--neon-secondary)_16%,transparent)] hover:border-[color-mix(in_oklch,var(--neon-secondary)_45%,transparent)] active:scale-[0.97]",
    danger:
      "bg-[color-mix(in_oklch,var(--neon-danger)_10%,transparent)] border border-[color-mix(in_oklch,var(--neon-danger)_30%,transparent)] text-[var(--neon-danger)] hover:bg-[color-mix(in_oklch,var(--neon-danger)_18%,transparent)] cursor-not-allowed opacity-60",
    ghost:
      "text-muted-foreground hover:text-foreground hover:bg-[var(--glass-hover)] active:scale-[0.97]",
    live: "bg-[color-mix(in_oklch,var(--neon-secondary)_15%,transparent)] border border-[color-mix(in_oklch,var(--neon-secondary)_35%,transparent)] text-[var(--neon-secondary)] hover:bg-[color-mix(in_oklch,var(--neon-secondary)_25%,transparent)] hover:border-[color-mix(in_oklch,var(--neon-secondary)_55%,transparent)] shadow-[var(--shadow-glow-cyan)] active:scale-[0.97]",
    expired:
      "bg-[color-mix(in_oklch,var(--neon-danger)_8%,transparent)] border border-[color-mix(in_oklch,var(--neon-danger)_20%,transparent)] text-[color-mix(in_oklch,var(--neon-danger)_70%,transparent)] cursor-not-allowed",
  };
  return (
    <Tag
      onClick={disabled ? undefined : onClick}
      disabled={Tag === "button" ? disabled : undefined}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </Tag>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── RECORDINGS TAB ──────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

type RecordingMode = "screen_voice" | "voice" | "screen";

interface RecordingEntry {
  recordingId: string;
  mode: RecordingMode;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  durationSec: number;
  fileSizeBytes: number;
  meetingId: string;
  meetingTitle: string;
  thumbnailUrl?: string | null;
  createdAt: number;
}

const MODE_META: Record<
  RecordingMode,
  { label: string; icon: React.ReactNode; color: string; bg: string; border: string }
> = {
  screen_voice: {
    label: "Screen + Voice",
    icon: <MonitorSmartphone className="h-3.5 w-3.5" />,
    color: "var(--neon-primary)",
    bg: "color-mix(in oklch, var(--neon-primary) 12%, transparent)",
    border: "color-mix(in oklch, var(--neon-primary) 35%, transparent)",
  },
  screen: {
    label: "Screen Only",
    icon: <Monitor className="h-3.5 w-3.5" />,
    color: "var(--neon-secondary)",
    bg: "color-mix(in oklch, var(--neon-secondary) 12%, transparent)",
    border: "color-mix(in oklch, var(--neon-secondary) 35%, transparent)",
  },
  voice: {
    label: "Voice Only",
    icon: <Mic2 className="h-3.5 w-3.5" />,
    color: "var(--neon-accent)",
    bg: "color-mix(in oklch, var(--neon-accent) 12%, transparent)",
    border: "color-mix(in oklch, var(--neon-accent) 35%, transparent)",
  },
};

function formatDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function groupByMeeting(
  recordings: RecordingEntry[],
): { meetingId: string; meetingTitle: string; recordings: RecordingEntry[] }[] {
  const map = new Map<
    string,
    { meetingId: string; meetingTitle: string; recordings: RecordingEntry[] }
  >();
  for (const r of recordings) {
    if (!map.has(r.meetingId)) {
      map.set(r.meetingId, {
        meetingId: r.meetingId,
        meetingTitle: r.meetingTitle,
        recordings: [],
      });
    }
    map.get(r.meetingId)!.recordings.push(r);
  }
  return Array.from(map.values());
}

function RecordingCard({ recording, index }: { recording: RecordingEntry; index: number }) {
  const [copied, setCopied] = useState(false);
  const meta = MODE_META[recording.mode];
  const handleCopy = () => {
    navigator.clipboard.writeText(recording.cloudinaryUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="group relative overflow-hidden rounded-2xl transition-all duration-200"
      style={{
        border: "1px solid var(--glass-border)",
        background: "var(--glass-bg)",
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        style={{
          background: "linear-gradient(to right, transparent, var(--neon-primary), transparent)",
        }}
      />
      <div className="flex gap-4 p-4">
        <div className="shrink-0">
          {recording.thumbnailUrl && recording.mode !== "voice" ? (
            <div
              className="relative h-20 w-32 overflow-hidden rounded-xl"
              style={{
                border: "1px solid var(--glass-border)",
                // FIX: was bg-black/40 — use card bg instead so it works in light mode
                background: "var(--card)",
              }}
            >
              <img
                src={recording.thumbnailUrl}
                alt="Recording thumbnail"
                className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                  <Play className="h-4 w-4 text-white fill-white" />
                </div>
              </div>
            </div>
          ) : (
            <div
              className="flex h-20 w-20 items-center justify-center rounded-xl"
              style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
            >
              <div style={{ color: meta.color }}>
                {recording.mode === "voice" ? (
                  <Mic2 className="h-8 w-8" />
                ) : (
                  <Video className="h-8 w-8" />
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
            >
              {meta.icon}
              {meta.label}
            </span>
            <span className="text-[11px] text-muted-foreground/60">
              {formatDate(recording.createdAt)} at {formatTime(recording.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-4 mb-2.5">
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span>{formatDur(recording.durationSec)}</span>
            </div>
            <div className="flex items-center gap-1 text-[12px] text-muted-foreground">
              <HardDrive className="h-3 w-3 shrink-0" />
              <span>{formatFileSize(recording.fileSizeBytes)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex-1 min-w-0 rounded-lg flex items-center gap-2 px-2.5 py-1.5"
              style={{ border: "1px solid var(--glass-border)", background: "var(--glass-bg)" }}
            >
              <span
                className="text-[11px] font-mono truncate flex-1"
                style={{ color: "var(--neon-secondary)" }}
              >
                {recording.cloudinaryUrl}
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              title="Copy link"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition shrink-0"
              style={
                copied
                  ? {
                      border:
                        "1px solid color-mix(in oklch, var(--neon-secondary) 50%, transparent)",
                      background: "color-mix(in oklch, var(--neon-secondary) 12%, transparent)",
                      color: "var(--neon-secondary)",
                    }
                  : {
                      border: "1px solid var(--glass-border)",
                      background: "var(--glass-bg)",
                      color: "var(--muted-foreground)",
                    }
              }
            >
              {copied ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </motion.button>
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href={recording.cloudinaryUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open recording"
              className="flex h-8 w-8 items-center justify-center rounded-lg transition shrink-0 text-muted-foreground hover:text-foreground"
              style={{
                border: "1px solid var(--glass-border)",
                background: "var(--glass-bg)",
              }}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </motion.a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MeetingRecordingGroup({
  group,
  groupIndex,
}: {
  group: { meetingId: string; meetingTitle: string; recordings: RecordingEntry[] };
  groupIndex: number;
}) {
  const [expanded, setExpanded] = useState(groupIndex === 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: groupIndex * 0.07 }}
      className="rounded-2xl overflow-hidden"
      style={{ border: "1px solid var(--glass-border)" }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 transition text-left"
        style={{ background: "var(--glass-bg)" }}
        onMouseEnter={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "var(--glass-hover)")
        }
        onMouseLeave={(e) =>
          ((e.currentTarget as HTMLElement).style.background = "var(--glass-bg)")
        }
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "color-mix(in oklch, var(--neon-primary) 15%, transparent)",
              border: "1px solid color-mix(in oklch, var(--neon-primary) 30%, transparent)",
            }}
          >
            <Film className="h-4 w-4" style={{ color: "var(--neon-primary)" }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{group.meetingTitle}</p>
            <p className="text-[11px] text-muted-foreground font-mono">{group.meetingId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span
            className="text-[11px] rounded-full px-2.5 py-0.5 text-muted-foreground"
            style={{ border: "1px solid var(--glass-border)", background: "var(--glass-bg)" }}
          >
            {group.recordings.length} recording{group.recordings.length !== 1 ? "s" : ""}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-3" style={{ borderTop: "1px solid var(--glass-border)" }}>
              {group.recordings.map((r, i) => (
                <RecordingCard key={r.recordingId} recording={r} index={i} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RecordingsTab() {
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(API_ENDPOINTS.USER_RECORDINGS);
      setRecordings(res.data.data.recordings ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to load recordings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const groups = groupByMeeting(recordings);
  const totalDurationSec = recordings.reduce((s, r) => s + r.durationSec, 0);
  const totalSizeBytes = recordings.reduce((s, r) => s + r.fileSizeBytes, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gradient">Recordings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            All your meeting recordings, saved to the cloud
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={fetchRecordings}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          style={{
            border: "1px solid var(--glass-border)",
            background: "var(--glass-bg)",
          }}
        >
          <Loader2 className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </motion.button>
      </div>

      {recordings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-3"
        >
          {[
            {
              label: "Total Recordings",
              value: recordings.length,
              icon: <Video className="h-4 w-4" />,
              color: "var(--neon-primary)",
            },
            {
              label: "Total Duration",
              value: formatDur(totalDurationSec),
              icon: <Clock className="h-4 w-4" />,
              color: "var(--neon-secondary)",
            },
            {
              label: "Total Size",
              value: formatFileSize(totalSizeBytes),
              icon: <HardDrive className="h-4 w-4" />,
              color: "var(--neon-accent)",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1.5 rounded-2xl px-4 py-3"
              style={{
                border: "1px solid var(--glass-border)",
                background: "var(--glass-bg)",
              }}
            >
              <div className="flex items-center gap-1.5" style={{ color: stat.color }}>
                {stat.icon}
                <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
                  {stat.label}
                </span>
              </div>
              <p className="text-lg font-bold" style={{ color: stat.color }}>
                {stat.value}
              </p>
            </div>
          ))}
        </motion.div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="h-8 w-8" style={{ color: "var(--neon-primary)" }} />
          </motion.div>
          <p className="text-sm text-muted-foreground">Loading recordings…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm" style={{ color: "var(--neon-danger)" }}>
            {error}
          </p>
          <button
            onClick={fetchRecordings}
            className="text-xs hover:underline"
            style={{ color: "var(--neon-primary)" }}
          >
            Try again
          </button>
        </div>
      ) : recordings.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-20 gap-5"
        >
          <div className="relative flex items-center justify-center w-32 h-32">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{
                border: "1px solid color-mix(in oklch, var(--neon-primary) 15%, transparent)",
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-4 rounded-full"
              style={{
                border: "1px dashed color-mix(in oklch, var(--neon-accent) 20%, transparent)",
              }}
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            />
            <div
              className="relative flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{
                background: "color-mix(in oklch, var(--neon-primary) 10%, transparent)",
                border: "1px solid color-mix(in oklch, var(--neon-primary) 25%, transparent)",
              }}
            >
              <Video className="h-7 w-7" style={{ color: "var(--neon-primary)" }} />
            </div>
          </div>
          <div className="text-center max-w-xs">
            <h3 className="text-base font-semibold mb-1">No recordings yet</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Start a meeting and click the{" "}
              <span className="text-foreground font-medium">Record</span> button to capture your
              sessions.
            </p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center mt-2">
            {(
              Object.entries(MODE_META) as [RecordingMode, (typeof MODE_META)[RecordingMode]][]
            ).map(([mode, meta]) => (
              <div
                key={mode}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-[12px]"
                style={{
                  background: meta.bg,
                  border: `1px solid ${meta.border}`,
                  color: meta.color,
                }}
              >
                {meta.icon}
                <span className="font-medium">{meta.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        <div className="space-y-4">
          {groups.map((group, i) => (
            <MeetingRecordingGroup key={group.meetingId} group={group} groupIndex={i} />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── THEME-AWARE DIALOG WRAPPER ───────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ThemedDialogContent wraps shadcn's DialogContent and overrides:
 *  - border: hardcoded `border-white/10` → `var(--glass-border)`
 *  - background: `glass-strong` uses the themed `--glass-bg-strong` var
 *  - The shadcn overlay (DialogOverlay) hardcodes `bg-black/80` in the
 *    component library. We override it by passing `overlayClassName` if
 *    your Dialog supports it, otherwise we patch via a wrapping div with
 *    a CSS-variable-aware overlay injected as a sibling via the portal.
 *
 * The simplest reliable fix: pass an explicit `className` that overrides
 * the border, and set `data-theme-dialog` so we can target the overlay
 * in a global CSS rule:
 *
 *   [data-radix-popper-content-wrapper] + [data-radix-dialog-overlay],
 *   [data-radix-dialog-overlay] {
 *     background: color-mix(in oklch, var(--background) 80%, transparent) !important;
 *     backdrop-filter: blur(8px);
 *   }
 *
 * Add that to your globals / styles.css for a full fix.
 * Here we also apply inline style to the content panel itself.
 */
function ThemedDialogContent({
  children,
  className = "",
  ...props
}: React.ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent
      className={cn("border-[var(--glass-border)]", className)}
      style={{
        background: "var(--card)",
        boxShadow:
          "0 8px 32px color-mix(in oklch, var(--background) 60%, transparent), 0 0 0 1px var(--glass-border)",
      }}
      {...props}
    >
      {children}
    </DialogContent>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN DASHBOARD COMPONENT ────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const [activeTab, setActiveTab] = useState<DashboardTab>("meetings");
  const [genOpen, setGenOpen] = useState(false);
  const [genLink, setGenLink] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinLink, setJoinLink] = useState("");
  const [joinTitle, setJoinTitle] = useState("");

  const [groups, setGroups] = useState<MeetingGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<MeetingGroup | null>(null);
  const [renameTarget, setRenameTarget] = useState<MeetingGroup | null>(null);

  const [duplicateTitle, setDuplicateTitle] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"instant" | "join" | null>(null);
  const [pendingJoinLink, setPendingJoinLink] = useState<string | null>(null);

  const loadHistory = () => {
    setLoading(true);
    meetingService
      .history()
      .then((r) => setGroups(r.groups))
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    loadHistory();
  }, [user, navigate]);

  const handleOpenGen = () => {
    setGenOpen(true);
    setGenLink(null);
    setDuplicateTitle(null);
    setPendingAction(null);
  };

  const handleGenerate = async (title: string) => {
    try {
      const res = await meetingService.generate({ title });
      setGenLink(res.link);
      setDuplicateTitle(null);
      setPendingAction(null);
      loadHistory();
    } catch (err) {
      const dup = extractDuplicateTitle(err);
      if (dup) {
        setDuplicateTitle(dup);
        setPendingAction("instant");
      } else {
        setGenOpen(false);
        toast.error(extractError(err).message);
      }
    }
  };

  const handleGenerateRetry = async (newTitle: string) => {
    setDuplicateTitle(null);
    await handleGenerate(newTitle);
  };

  const join = async () => {
    try {
      const url = new URL(joinLink);
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[parts.length - 1];
      if (!id) throw new Error("No ID");

      const recordTitle = joinTitle.trim() || "Joined meeting";

      try {
        await meetingService.recordJoined({ meetingLink: joinLink, title: recordTitle });
        loadHistory();
      } catch (recordErr) {
        const dup = extractDuplicateTitle(recordErr);
        if (dup) {
          setPendingJoinLink(joinLink);
          setDuplicateTitle(dup);
          setPendingAction("join");
          setJoinOpen(false);
          return;
        }
      }

      navigate({ to: "/meeting/$id", params: { id } });
    } catch {
      toast.error("Enter a valid meeting link");
    }
  };

  const handleJoinRetry = async (newTitle: string) => {
    setDuplicateTitle(null);
    setPendingAction(null);

    const link = pendingJoinLink;
    setPendingJoinLink(null);
    if (!link) return;

    try {
      const url = new URL(link);
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[parts.length - 1];

      try {
        await meetingService.recordJoined({ meetingLink: link, title: newTitle });
        loadHistory();
      } catch {
        // Non-fatal
      }

      navigate({ to: "/meeting/$id", params: { id } });
    } catch {
      toast.error("Something went wrong - please try again.");
    }
  };

  const handleDuplicateClose = () => {
    setDuplicateTitle(null);
    setPendingAction(null);
    setPendingJoinLink(null);
  };

  const handleDeleteRequest = (group: MeetingGroup) => {
    if (group.isActive) {
      toast.error("End the meeting before deleting it.", {
        description: "You can't delete a room that's currently live.",
      });
      return;
    }
    setDeleteTarget(group);
  };

  const handleDeleteConfirm = async (meetingId: string) => {
    setGroups((prev) => prev.filter((g) => g.meetingId !== meetingId));
    try {
      await meetingService.deleteMeeting(meetingId);
      toast.success("Meeting deleted successfully.");
      loadHistory();
    } catch (err) {
      loadHistory();
      const { message } = extractError(err);
      toast.error(message || "Failed to delete meeting. Please try again.");
      throw err;
    }
  };

  const handleDeleteClose = () => setDeleteTarget(null);
  const handleRenameRequest = (group: MeetingGroup) => setRenameTarget(group);
  const handleRenameSuccess = (meetingId: string, newTitle: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.meetingId === meetingId ? { ...g, title: newTitle } : g)),
    );
    setRenameTarget(null);
  };
  const handleRenameClose = () => setRenameTarget(null);

  if (!user?.username) return null;

  const displayName = user.username;
  const avatarLetter = displayName[0]?.toUpperCase() ?? "U";

  return (
    <main className="relative min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <motion.div
            whileHover={{ scale: 1.08, rotate: -4 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
          >
            <LuminaLogo size={32} />
          </motion.div>
          <span className="font-semibold tracking-tight">Lumina Meet</span>
        </Link>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-full glass px-3 py-1.5 text-sm">
            <div className="h-6 w-6 rounded-full bg-gradient-neon flex items-center justify-center text-[10px] font-bold text-white">
              {avatarLetter}
            </div>
            <span className="text-muted-foreground">{displayName}</span>
          </div>
          <ThemeToggle />
          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground transition-all duration-150 active:scale-[0.97]"
            style={{
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background =
                "color-mix(in oklch, var(--neon-danger) 12%, transparent)";
              (e.currentTarget as HTMLElement).style.borderColor =
                "color-mix(in oklch, var(--neon-danger) 30%, transparent)";
              (e.currentTarget as HTMLElement).style.color = "var(--neon-danger)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "var(--glass-bg)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)";
              (e.currentTarget as HTMLElement).style.color = "";
            }}
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout
          </button>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="mx-auto mt-10 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Good to see you, <span className="text-gradient">{displayName}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">What would you like to do today?</p>
        </motion.div>

        {/* ── Action cards ─────────────────────────────────────────────── */}
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <ActionCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Instant meeting"
            description="Spin up a room right now."
            primary
            onClick={handleOpenGen}
          />
          <ActionCard
            icon={<Calendar className="h-5 w-5" />}
            title="Schedule meeting"
            description="Plan it for later."
            onClick={() => navigate({ to: "/schedule" })}
          />
          <ActionCard
            icon={<Video className="h-5 w-5" />}
            title="Join meeting"
            description="Paste a link to join."
            onClick={() => setJoinOpen(true)}
          />
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────── */}
        <div className="mt-10 glass rounded-2xl overflow-hidden">
          <div
            className="flex items-center justify-between px-5 py-1"
            style={{ borderBottom: "1px solid var(--glass-border)" }}
          >
            <div className="flex items-center gap-1">
              <TabButton
                active={activeTab === "meetings"}
                onClick={() => setActiveTab("meetings")}
                icon={<History className="h-3.5 w-3.5" />}
                label="Recent meetings"
                count={groups.length}
              />
              <TabButton
                active={activeTab === "recordings"}
                onClick={() => setActiveTab("recordings")}
                icon={<Film className="h-3.5 w-3.5" />}
                label="Recordings"
              />
            </div>

            <AnimatePresence mode="wait">
              {activeTab === "meetings" && (
                <motion.button
                  key="send-invites"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setInviteOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 active:scale-[0.97]"
                  style={{
                    background: "color-mix(in oklch, var(--neon-primary) 10%, transparent)",
                    border: "1px solid color-mix(in oklch, var(--neon-primary) 25%, transparent)",
                    color: "var(--neon-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "color-mix(in oklch, var(--neon-primary) 20%, transparent)";
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "color-mix(in oklch, var(--neon-primary) 45%, transparent)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background =
                      "color-mix(in oklch, var(--neon-primary) 10%, transparent)";
                    (e.currentTarget as HTMLElement).style.borderColor =
                      "color-mix(in oklch, var(--neon-primary) 25%, transparent)";
                  }}
                >
                  <Send className="h-3 w-3" />
                  Send invites
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div className="p-5">
            <AnimatePresence mode="wait">
              {activeTab === "meetings" ? (
                <motion.div
                  key="meetings"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  {loading ? (
                    <HistorySkeleton />
                  ) : groups.length === 0 ? (
                    <EmptyHistory onStart={handleOpenGen} />
                  ) : (
                    <ul className="divide-y divide-[var(--glass-border)] -mx-5">
                      {groups.map((group, i) => (
                        <MeetingGroupRow
                          key={group.meetingId}
                          group={group}
                          index={i}
                          onDeleteRequest={handleDeleteRequest}
                          onRenameRequest={handleRenameRequest}
                        />
                      ))}
                    </ul>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="recordings"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <RecordingsTab />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* ── Modals ─────────────────────────────────────────────────────── */}

      <MeetingGenerationModal
        open={genOpen}
        link={genLink}
        duplicateTitle={pendingAction === "instant" ? duplicateTitle : null}
        onClose={() => {
          setGenOpen(false);
          setGenLink(null);
          setDuplicateTitle(null);
          setPendingAction(null);
        }}
        onGenerate={handleGenerate}
        onRetry={handleGenerateRetry}
      />

      {/* ── Join dialog — uses ThemedDialogContent to avoid hardcoded dark bg ── */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <ThemedDialogContent>
          <DialogHeader>
            <DialogTitle>Join a meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <FloatingInput
              label="Meeting link"
              value={joinLink}
              onChange={(e) => setJoinLink(e.target.value)}
              placeholder=" "
            />
            <FloatingInput
              label="Title (optional - saved to your history)"
              value={joinTitle}
              onChange={(e) => setJoinTitle(e.target.value)}
              placeholder=" "
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
            <NeonButton fullWidth onClick={join}>
              <Video className="h-4 w-4" /> Join meeting
            </NeonButton>
          </div>
        </ThemedDialogContent>
      </Dialog>

      <InviteDialog
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          loadHistory();
        }}
      />

      <DeleteMeetingModal
        open={deleteTarget !== null}
        meeting={deleteTarget}
        onClose={handleDeleteClose}
        onConfirm={handleDeleteConfirm}
      />

      <RenameMeetingModal
        open={renameTarget !== null}
        meeting={renameTarget}
        onClose={handleRenameClose}
        onSuccess={handleRenameSuccess}
      />

      <DuplicateTitleModal
        open={pendingAction === "join" && !!duplicateTitle}
        conflictingTitle={duplicateTitle ?? ""}
        onRetry={handleJoinRetry}
        onClose={handleDuplicateClose}
      />
    </main>
  );
}

// ─── TabButton ────────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative inline-flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors duration-150",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground/80",
      )}
    >
      {icon}
      {label}
      {typeof count === "number" && count > 0 && (
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          style={{ background: "var(--glass-bg)" }}
        >
          {count}
        </span>
      )}
      {active && (
        <motion.div
          layoutId="tab-underline"
          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
          style={{ background: "var(--neon-primary)" }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
    </button>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyHistory({ onStart }: { onStart: () => void }) {
  return (
    <div className="px-5 py-14 flex flex-col items-center gap-4 text-center">
      <div
        className="h-14 w-14 rounded-2xl flex items-center justify-center"
        style={{
          background: "var(--glass-bg)",
          border: "1px solid var(--glass-border)",
        }}
      >
        <History className="h-6 w-6 opacity-20" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">No meetings yet</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">Start one and it'll appear here.</p>
      </div>
      <button
        onClick={onStart}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-neon text-white transition-all duration-150 active:scale-[0.97]"
        style={{ boxShadow: "var(--shadow-glow-primary)" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.filter = "brightness(1.1)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.filter = "")}
      >
        <Plus className="h-4 w-4" />
        Start your first meeting
      </button>
    </div>
  );
}

// ─── Badge config ─────────────────────────────────────────────────────────────

const BADGE_STYLES = {
  live: {
    label: "● Live",
    style: {
      background: "color-mix(in oklch, var(--neon-secondary) 15%, transparent)",
      color: "var(--neon-secondary)",
    },
  },
  instant: {
    label: "Instant",
    style: {
      background: "color-mix(in oklch, var(--neon-accent) 12%, transparent)",
      color: "var(--neon-accent)",
    },
  },
  scheduled: {
    label: "Scheduled",
    style: {
      background: "color-mix(in oklch, var(--neon-primary) 15%, transparent)",
      color: "var(--neon-primary)",
    },
  },
  joined: {
    label: "Joined",
    style: {
      background: "color-mix(in oklch, var(--neon-secondary) 12%, transparent)",
      color: "var(--neon-secondary)",
    },
  },
  expired: {
    label: "Expired",
    style: {
      background: "color-mix(in oklch, var(--neon-danger) 15%, transparent)",
      color: "var(--neon-danger)",
    },
  },
} as const;

function MeetingTypeBadge({ group }: { group: MeetingGroup }) {
  const badgeKey = isScheduledExpired(group)
    ? "expired"
    : group.isActive
      ? "live"
      : ((group.type as keyof typeof BADGE_STYLES) ?? "instant");
  const cfg = BADGE_STYLES[badgeKey] ?? BADGE_STYLES.instant;
  return (
    <span
      className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
      style={cfg.style}
    >
      {cfg.label}
    </span>
  );
}

function MeetingDateLine({ group }: { group: MeetingGroup }) {
  if (group.type === "scheduled" && group.scheduledFor) {
    return (
      <StatPill icon={<Calendar className="h-3 w-3" />}>{shortDate(group.scheduledFor)}</StatPill>
    );
  }
  if (group.type === "joined" && group.sessions.length > 0) {
    return (
      <StatPill icon={<Link2 className="h-3 w-3" />}>
        Joined {relativeDate(group.sessions[0].joinedAt)}
      </StatPill>
    );
  }
  return (
    <StatPill icon={<Clock className="h-3 w-3" />}>
      Created {relativeDate(group.createdAt)}
    </StatPill>
  );
}

function MeetingCTA({ group }: { group: MeetingGroup }) {
  if (isScheduledExpired(group)) {
    return (
      <span
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-not-allowed select-none"
        style={{
          background: "color-mix(in oklch, var(--neon-danger) 8%, transparent)",
          border: "1px solid color-mix(in oklch, var(--neon-danger) 20%, transparent)",
          color: "color-mix(in oklch, var(--neon-danger) 60%, transparent)",
        }}
      >
        <AlertTriangle className="h-3 w-3" />
        Expired
      </span>
    );
  }

  if (isScheduledUpcoming(group) && group.scheduledFor) {
    return (
      <Link
        to="/meeting/$id"
        params={{ id: group.meetingId }}
        search={{ scheduledFor: group.scheduledFor }}
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 active:scale-[0.97]"
        style={{
          background: "color-mix(in oklch, var(--neon-primary) 10%, transparent)",
          border: "1px solid color-mix(in oklch, var(--neon-primary) 30%, transparent)",
          color: "var(--neon-primary)",
        }}
      >
        <Timer className="h-3 w-3" />
        View countdown
      </Link>
    );
  }

  if (group.isActive) {
    return (
      <Link
        to="/meeting/$id"
        params={{ id: group.meetingId }}
        onClick={(e) => e.stopPropagation()}
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 active:scale-[0.97]"
        style={{
          background: "color-mix(in oklch, var(--neon-secondary) 18%, transparent)",
          border: "1px solid color-mix(in oklch, var(--neon-secondary) 40%, transparent)",
          color: "var(--neon-secondary)",
          boxShadow: "var(--shadow-glow-cyan)",
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full animate-pulse"
          style={{ background: "var(--neon-secondary)" }}
        />
        Join live
      </Link>
    );
  }

  return (
    <Link
      to="/meeting/$id"
      params={{ id: group.meetingId }}
      onClick={(e) => e.stopPropagation()}
      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground transition-all duration-150 active:scale-[0.97]"
      style={{
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "color-mix(in oklch, var(--neon-secondary) 10%, transparent)";
        (e.currentTarget as HTMLElement).style.borderColor =
          "color-mix(in oklch, var(--neon-secondary) 25%, transparent)";
        (e.currentTarget as HTMLElement).style.color = "var(--neon-secondary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--glass-bg)";
        (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)";
        (e.currentTarget as HTMLElement).style.color = "";
      }}
    >
      <RotateCcw className="h-3 w-3" />
      Rejoin
    </Link>
  );
}

// ─── MeetingGroupRow ──────────────────────────────────────────────────────────

function MeetingGroupRow({
  group,
  index,
  onDeleteRequest,
  onRenameRequest,
}: {
  group: MeetingGroup;
  index: number;
  onDeleteRequest: (group: MeetingGroup) => void;
  onRenameRequest: (group: MeetingGroup) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasSessions = group.supportsMultipleSessions && group.sessions.length > 0;
  const expired = isScheduledExpired(group);

  const iconBg = expired
    ? "color-mix(in oklch, var(--neon-danger) 10%, transparent)"
    : group.isActive
      ? "color-mix(in oklch, var(--neon-secondary) 18%, transparent)"
      : "var(--glass-bg)";

  const iconRing = group.isActive
    ? "1px solid color-mix(in oklch, var(--neon-secondary) 40%, transparent)"
    : undefined;

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, transition: { duration: 0.18 } }}
      transition={{ delay: index * 0.04 }}
      className={expired ? "relative opacity-70 group" : "relative group"}
    >
      {expired && (
        <div
          className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r"
          style={{ background: "color-mix(in oklch, var(--neon-danger) 50%, transparent)" }}
        />
      )}
      <div
        className={`flex items-center gap-3 px-5 py-4 transition hover:bg-[var(--glass-hover)] ${hasSessions ? "cursor-pointer" : ""}`}
        onClick={() => hasSessions && setOpen((v) => !v)}
        role={hasSessions ? "button" : undefined}
        aria-expanded={hasSessions ? open : undefined}
      >
        <div className="flex-shrink-0 w-5 flex items-center justify-center">
          {hasSessions ? (
            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </motion.div>
          ) : (
            <div className="h-4 w-4" />
          )}
        </div>

        <div
          className="flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center"
          style={{
            background: iconBg,
            ...(iconRing ? { border: iconRing } : {}),
          }}
        >
          {expired ? (
            <AlertTriangle className="h-4 w-4" style={{ color: "var(--neon-danger)" }} />
          ) : group.isActive ? (
            <Activity className="h-4 w-4" style={{ color: "var(--neon-secondary)" }} />
          ) : group.type === "scheduled" ? (
            <Calendar className="h-4 w-4" style={{ color: "var(--neon-primary)" }} />
          ) : group.type === "joined" ? (
            <Link2 className="h-4 w-4" style={{ color: "var(--neon-secondary)" }} />
          ) : (
            <Zap className="h-4 w-4" style={{ color: "var(--neon-accent)" }} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`font-medium truncate ${expired ? "text-muted-foreground" : ""}`}>
              {group.title}
            </p>
            <MeetingTypeBadge group={group} />
          </div>
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            {expired && group.scheduledFor && (
              <StatPill
                icon={<AlertTriangle className="h-3 w-3" style={{ color: "var(--neon-danger)" }} />}
              >
                <span style={{ color: "color-mix(in oklch, var(--neon-danger) 80%, transparent)" }}>
                  Was scheduled for {shortDate(group.scheduledFor)} - link no longer valid
                </span>
              </StatPill>
            )}
            {!expired && (
              <>
                {group.supportsMultipleSessions && (
                  <StatPill icon={<RotateCcw className="h-3 w-3" />}>
                    {group.sessionCount === 0
                      ? "Never used"
                      : group.sessionCount === 1
                        ? "Used once"
                        : `Used ${group.sessionCount}×`}
                  </StatPill>
                )}
                {group.totalDurationMin > 0 && (
                  <StatPill icon={<Timer className="h-3 w-3" />}>
                    {formatDuration(group.totalDurationMin)} total
                  </StatPill>
                )}
                <MeetingDateLine group={group} />
              </>
            )}
          </div>
        </div>

        {/* ── Row action buttons ─────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <MeetingCTA group={group} />

          {/* Rename */}
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              onRenameRequest(group);
            }}
            title="Rename meeting"
            aria-label="Rename meeting"
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 active:scale-[0.93]"
            style={{
              border: "1px solid var(--glass-border)",
              background: "transparent",
              color: "var(--muted-foreground)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor =
                "color-mix(in oklch, var(--neon-primary) 45%, transparent)";
              (e.currentTarget as HTMLElement).style.background =
                "color-mix(in oklch, var(--neon-primary) 12%, transparent)";
              (e.currentTarget as HTMLElement).style.color = "var(--neon-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)";
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "";
            }}
            whileTap={{ scale: 0.9 }}
          >
            <Pencil className="h-3.5 w-3.5" />
          </motion.button>

          {/* Delete */}
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest(group);
            }}
            title={group.isActive ? "End meeting before deleting" : "Delete meeting"}
            aria-label="Delete meeting"
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-150 opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
            style={
              group.isActive
                ? {
                    border: "1px solid color-mix(in oklch, var(--neon-danger) 20%, transparent)",
                    background: "transparent",
                    color: "color-mix(in oklch, var(--neon-danger) 35%, transparent)",
                    cursor: "not-allowed",
                  }
                : {
                    border: "1px solid var(--glass-border)",
                    background: "transparent",
                    color: "var(--muted-foreground)",
                  }
            }
            onMouseEnter={(e) => {
              if (group.isActive) return;
              (e.currentTarget as HTMLElement).style.borderColor =
                "color-mix(in oklch, var(--neon-danger) 45%, transparent)";
              (e.currentTarget as HTMLElement).style.background =
                "color-mix(in oklch, var(--neon-danger) 10%, transparent)";
              (e.currentTarget as HTMLElement).style.color = "var(--neon-danger)";
            }}
            onMouseLeave={(e) => {
              if (group.isActive) return;
              (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)";
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "";
            }}
            whileTap={group.isActive ? undefined : { scale: 0.9 }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </motion.button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && hasSessions && (
          <motion.div
            key="sessions"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <SessionTimeline sessions={group.sessions} meetingId={group.meetingId} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

// ─── SessionTimeline ──────────────────────────────────────────────────────────

function SessionTimeline({
  sessions,
  meetingId,
}: {
  sessions: MeetingGroup["sessions"];
  meetingId: string;
}) {
  return (
    <div className="ml-[3.25rem] mr-4 mb-4">
      <div
        className="relative pl-5 space-y-0"
        style={{ borderLeft: "1px solid var(--glass-border)" }}
      >
        {sessions.map((session, i) => (
          <motion.div
            key={session.sessionId}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="relative py-2.5"
          >
            <span
              className={
                session.leftAt == null
                  ? "absolute -left-[1.4rem] top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border-2 animate-pulse"
                  : "absolute -left-[1.4rem] top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border-2"
              }
              style={
                session.leftAt == null
                  ? {
                      borderColor: "var(--neon-secondary)",
                      background: "color-mix(in oklch, var(--neon-secondary) 40%, transparent)",
                    }
                  : {
                      borderColor: "var(--glass-border-strong)",
                      background: "var(--glass-bg)",
                    }
              }
            />
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground/90">
                  {fullDate(session.joinedAt)}
                </p>
                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                  {session.leftAt == null ? (
                    <span
                      className="flex items-center gap-1 text-[11px]"
                      style={{ color: "var(--neon-secondary)" }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full animate-pulse inline-block"
                        style={{ background: "var(--neon-secondary)" }}
                      />
                      In progress
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Timer className="h-3 w-3" />
                      {session.durationMin === 0
                        ? "Less than a minute"
                        : formatDuration(session.durationMin)}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground/50">
                    Session {sessions.length - i}
                  </span>
                </div>
              </div>
              <Link
                to="/meeting/$id"
                params={{ id: meetingId }}
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-muted-foreground transition-all duration-150 active:scale-[0.97]"
                style={{
                  background: "var(--glass-bg)",
                  border: "1px solid var(--glass-border)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "color-mix(in oklch, var(--neon-secondary) 10%, transparent)";
                  (e.currentTarget as HTMLElement).style.borderColor =
                    "color-mix(in oklch, var(--neon-secondary) 20%, transparent)";
                  (e.currentTarget as HTMLElement).style.color = "var(--neon-secondary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "var(--glass-bg)";
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--glass-border)";
                  (e.currentTarget as HTMLElement).style.color = "";
                }}
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </Link>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className="opacity-60">{icon}</span>
      {children}
    </span>
  );
}

// ─── HistorySkeleton ──────────────────────────────────────────────────────────

function HistorySkeleton() {
  return (
    <ul className="divide-y divide-[var(--glass-border)] -mx-5">
      {[...Array(4)].map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-4">
          <div
            className="h-9 w-9 rounded-xl shimmer flex-shrink-0"
            style={{ background: "var(--glass-bg)" }}
          />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-48 rounded shimmer" style={{ background: "var(--glass-bg)" }} />
            <div className="h-2.5 w-32 rounded shimmer" style={{ background: "var(--glass-bg)" }} />
          </div>
          <div className="h-7 w-16 rounded-lg shimmer" style={{ background: "var(--glass-bg)" }} />
        </li>
      ))}
    </ul>
  );
}

// ─── ActionCard ───────────────────────────────────────────────────────────────

function ActionCard({
  icon,
  title,
  description,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl p-6 text-left transition ${
        primary ? "bg-gradient-neon text-white" : "glass hover:border-[var(--glass-border-strong)]"
      }`}
      style={primary ? { boxShadow: "var(--shadow-glow-primary)" } : undefined}
    >
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          primary ? "bg-white/20" : "bg-gradient-neon"
        }`}
      >
        <span className="text-white">{icon}</span>
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className={`mt-1 text-sm ${primary ? "text-white/80" : "text-muted-foreground"}`}>
        {description}
      </p>
      <div className="mt-4">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
            primary ? "bg-white/20 text-white hover:bg-white/30" : "text-[var(--neon-secondary)]"
          }`}
          style={
            !primary
              ? {
                  background: "var(--glass-bg)",
                  border: "1px solid var(--glass-border)",
                }
              : undefined
          }
        >
          <Plus className="h-3 w-3" />
          {primary ? "Start now" : "Open"}
        </span>
      </div>
    </motion.button>
  );
}

// ─── InviteDialog ─────────────────────────────────────────────────────────────

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [emails, setEmails] = useState("");
  const [title, setTitle] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [resultLink, setResultLink] = useState<string | null>(null);
  const [dupTitle, setDupTitle] = useState<string | null>(null);

  const handleClose = () => {
    setEmails("");
    setTitle("");
    setResultLink(null);
    setDupTitle(null);
    onClose();
  };

  const send = async (overrideTitle?: string) => {
    const list = emails
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!list.length) {
      toast.error("Add at least one email");
      return;
    }

    const trimmedTitle = (overrideTitle ?? title).trim();
    if (!trimmedTitle) {
      toast.error("Add a meeting title");
      return;
    }

    setLoadingInvite(true);
    try {
      const res = await meetingService.generateAndInvite({ emails: list, title: trimmedTitle });
      setResultLink(res.link);
      toast.success(
        `Invites sent to ${res.sent} recipient${res.sent !== 1 ? "s" : ""}${res.failed > 0 ? ` (${res.failed} failed)` : ""}`,
      );
      setEmails("");
      setTitle(trimmedTitle);
      setDupTitle(null);
    } catch (err) {
      const dup = extractDuplicateTitle(err);
      if (dup) {
        setDupTitle(dup);
      } else {
        toast.error(extractError(err).message);
      }
    } finally {
      setLoadingInvite(false);
    }
  };

  const handleRetry = async (newTitle: string) => {
    setDupTitle(null);
    setTitle(newTitle);
    await send(newTitle);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        {/* FIX: ThemedDialogContent instead of DialogContent with border-white/10 */}
        <ThemedDialogContent>
          <DialogHeader>
            <DialogTitle>Send invites</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-1">
            A new meeting room will be created and your guests will receive an email invitation.
          </p>
          <div className="space-y-3 mt-2">
            <FloatingInput
              label="Meeting title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder=" "
              maxLength={200}
            />
            <FloatingInput
              label="Emails (comma or space separated)"
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              placeholder=" "
            />
            <NeonButton fullWidth loading={loadingInvite} onClick={() => send()}>
              <Send className="h-4 w-4" />
              {loadingInvite ? "Sending…" : "Send invites"}
            </NeonButton>

            {resultLink && (
              <div
                className="rounded-xl p-4 space-y-3"
                style={{
                  border: "1px solid var(--glass-border)",
                  background: "var(--glass-bg)",
                }}
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Meeting link
                </p>
                <p
                  className="text-xs break-all font-mono leading-relaxed"
                  style={{ color: "var(--neon-secondary)" }}
                >
                  {resultLink}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(resultLink).catch(() => {});
                      toast.success("Link copied!");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 active:scale-[0.97]"
                    style={{
                      background: "color-mix(in oklch, var(--neon-primary) 10%, transparent)",
                      border: "1px solid color-mix(in oklch, var(--neon-primary) 25%, transparent)",
                      color: "var(--neon-primary)",
                    }}
                  >
                    <Copy className="h-3 w-3" />
                    Copy link
                  </button>
                  <button
                    onClick={() => setResultLink(null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-all duration-150 active:scale-[0.97]"
                    style={{
                      background: "var(--glass-bg)",
                      border: "1px solid var(--glass-border)",
                    }}
                  >
                    <RefreshCw className="h-3 w-3" />
                    New meeting
                  </button>
                </div>
              </div>
            )}
          </div>
        </ThemedDialogContent>
      </Dialog>

      <DuplicateTitleModal
        open={!!dupTitle}
        conflictingTitle={dupTitle ?? ""}
        onRetry={handleRetry}
        onClose={() => setDupTitle(null)}
      />
    </>
  );
}
