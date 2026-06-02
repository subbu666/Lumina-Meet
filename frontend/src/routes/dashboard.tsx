/**
 * dashboard.tsx — Lumina Meet Dashboard
 *
 * CHANGES vs previous version:
 *   - Delete meeting: each MeetingGroupRow now has a trash icon button.
 *   - DeleteMeetingModal is wired up: open → confirm → optimistic removal from state.
 *   - Active meetings block deletion with a clear toast (end the meeting first).
 *   - All other code is identical to the previous version.
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
  // RecordingsTab icons
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
import { meetingService, type MeetingGroup, formatDuration } from "@/api/services/meetingService";
import { extractError } from "@/api/apiClient";
import { apiClient } from "@/api/apiClient";
import { API_ENDPOINTS } from "@/api/endpoints";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Lumina Meet" }] }),
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

// ─── Expiry helpers ───────────────────────────────────────────────────────────

function isScheduledExpired(group: MeetingGroup): boolean {
  if (group.type !== "scheduled" || !group.scheduledFor) return false;
  if (group.status === "cancelled" || group.status === "completed") return true;
  const durationMs = ((group as any).duration ?? 60) * 60 * 1000;
  return Date.now() > group.scheduledFor + durationMs;
}

function isScheduledUpcoming(group: MeetingGroup): boolean {
  if (group.type !== "scheduled" || !group.scheduledFor) return false;
  if (group.status === "active") return false;
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
      "bg-gradient-neon text-white shadow-[0_4px_20px_-6px_oklch(0.65_0.22_280/0.6)] hover:shadow-[0_6px_28px_-6px_oklch(0.65_0.22_280/0.8)] hover:brightness-110 active:scale-[0.97]",
    secondary:
      "bg-[oklch(0.82_0.16_210/0.08)] border border-[oklch(0.82_0.16_210/0.25)] text-[var(--neon-secondary)] hover:bg-[oklch(0.82_0.16_210/0.16)] hover:border-[oklch(0.82_0.16_210/0.45)] active:scale-[0.97]",
    danger:
      "bg-[oklch(0.72_0.22_35/0.1)] border border-[oklch(0.72_0.22_35/0.3)] text-[oklch(0.82_0.2_35)] hover:bg-[oklch(0.72_0.22_35/0.18)] cursor-not-allowed opacity-60",
    ghost: "text-muted-foreground hover:text-foreground hover:bg-white/[0.06] active:scale-[0.97]",
    live: "bg-[oklch(0.65_0.22_160/0.15)] border border-[oklch(0.65_0.22_160/0.35)] text-[var(--neon-secondary)] hover:bg-[oklch(0.65_0.22_160/0.25)] hover:border-[oklch(0.65_0.22_160/0.55)] shadow-[0_0_12px_-4px_oklch(0.65_0.22_160/0.4)] active:scale-[0.97]",
    expired:
      "bg-[oklch(0.72_0.22_35/0.08)] border border-[oklch(0.72_0.22_35/0.2)] text-[oklch(0.72_0.22_35/0.7)] cursor-not-allowed",
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
    color: "oklch(0.82 0.16 280)",
    bg: "oklch(0.65 0.22 280 / 0.12)",
    border: "oklch(0.65 0.22 280 / 0.35)",
  },
  screen: {
    label: "Screen Only",
    icon: <Monitor className="h-3.5 w-3.5" />,
    color: "oklch(0.82 0.16 210)",
    bg: "oklch(0.65 0.18 210 / 0.12)",
    border: "oklch(0.65 0.18 210 / 0.35)",
  },
  voice: {
    label: "Voice Only",
    icon: <Mic2 className="h-3.5 w-3.5" />,
    color: "oklch(0.85 0.16 305)",
    bg: "oklch(0.75 0.18 305 / 0.12)",
    border: "oklch(0.75 0.18 305 / 0.35)",
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
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
      className="group relative overflow-hidden rounded-2xl border border-white/8 bg-white/3 hover:border-white/14 hover:bg-white/5 transition-all duration-200"
    >
      <div className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-transparent via-[var(--neon-primary)] to-transparent" />

      <div className="flex gap-4 p-4">
        <div className="shrink-0">
          {recording.thumbnailUrl && recording.mode !== "voice" ? (
            <div className="relative h-20 w-32 overflow-hidden rounded-xl border border-white/8 bg-black/40">
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
              className="flex h-20 w-20 items-center justify-center rounded-xl border"
              style={{ background: meta.bg, borderColor: meta.border }}
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
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold border"
              style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
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
            <div className="flex-1 min-w-0 rounded-lg border border-white/8 bg-white/4 px-2.5 py-1.5 flex items-center gap-2">
              <span className="text-[11px] font-mono text-[var(--neon-secondary)] truncate flex-1">
                {recording.cloudinaryUrl}
              </span>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCopy}
              title="Copy link"
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg border transition shrink-0",
                copied
                  ? "border-[oklch(0.75_0.18_145/0.5)] bg-[oklch(0.75_0.18_145/0.12)] text-[oklch(0.85_0.15_145)]"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10",
              )}
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
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10 transition shrink-0"
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
      className="rounded-2xl border border-white/8 overflow-hidden"
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-white/3 hover:bg-white/5 transition text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--neon-primary)]/15 border border-[var(--neon-primary)]/30">
            <Film className="h-4 w-4 text-[var(--neon-primary)]" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{group.meetingTitle}</p>
            <p className="text-[11px] text-muted-foreground font-mono">{group.meetingId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-muted-foreground">
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
            <div className="p-4 space-y-3 border-t border-white/5">
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
      {/* Header */}
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
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition disabled:opacity-50"
        >
          <Loader2 className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </motion.button>
      </div>

      {/* Stats bar */}
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
              className="flex flex-col gap-1.5 rounded-2xl border border-white/8 bg-white/3 px-4 py-3"
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

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
          >
            <Loader2 className="h-8 w-8 text-[var(--neon-primary)]" />
          </motion.div>
          <p className="text-sm text-muted-foreground">Loading recordings…</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <p className="text-sm text-[oklch(0.82_0.2_35)]">{error}</p>
          <button
            onClick={fetchRecordings}
            className="text-xs text-[var(--neon-primary)] hover:underline"
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
              className="absolute inset-0 rounded-full border border-[var(--neon-primary)]/15"
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="absolute inset-4 rounded-full border border-dashed border-[var(--neon-accent)]/20"
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--neon-primary)]/10 border border-[var(--neon-primary)]/25">
              <Video className="h-7 w-7 text-[var(--neon-primary)]" />
            </div>
          </div>

          <div className="text-center max-w-xs">
            <h3 className="text-base font-semibold mb-1">No recordings yet</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Start a meeting and click the{" "}
              <span className="text-foreground font-medium">Record</span> button (host or co-host
              only) to capture your sessions.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap justify-center mt-2">
            {(
              Object.entries(MODE_META) as [RecordingMode, (typeof MODE_META)[RecordingMode]][]
            ).map(([mode, meta]) => (
              <div
                key={mode}
                className="flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px]"
                style={{ background: meta.bg, borderColor: meta.border, color: meta.color }}
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

  // ── Delete modal state ──────────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<MeetingGroup | null>(null);

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
  };

  const handleGenerate = async (title: string) => {
    try {
      const res = await meetingService.generate({ title });
      setGenLink(res.link);
      loadHistory();
    } catch (err) {
      setGenOpen(false);
      toast.error(extractError(err).message);
    }
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
      } catch {
        // Non-fatal
      }

      navigate({ to: "/meeting/$id", params: { id } });
    } catch {
      toast.error("Enter a valid meeting link");
    }
  };

  // ── Delete handlers ─────────────────────────────────────────────────────────

  /**
   * Called when the user clicks the trash icon on a meeting row.
   * Active meetings show a toast instead of opening the modal.
   */
  const handleDeleteRequest = (group: MeetingGroup) => {
    if (group.isActive) {
      toast.error("End the meeting before deleting it.", {
        description: "You can't delete a room that's currently live.",
      });
      return;
    }
    setDeleteTarget(group);
  };

  /**
   * Called by DeleteMeetingModal when the user confirms.
   * Optimistically removes the row, then refetches on success.
   * On API error, restores the row and re-throws so the modal can catch it.
   */
  const handleDeleteConfirm = async (meetingId: string) => {
    // Optimistic remove
    setGroups((prev) => prev.filter((g) => g.meetingId !== meetingId));
    try {
      await meetingService.deleteMeeting(meetingId);
      toast.success("Meeting deleted successfully.");
      // Sync truth from server (removes any race conditions)
      loadHistory();
    } catch (err) {
      // Restore the row on failure
      loadHistory();
      const { message } = extractError(err);
      toast.error(message || "Failed to delete meeting. Please try again.");
      throw err; // let the modal know to revert to idle phase
    }
  };

  const handleDeleteClose = () => {
    setDeleteTarget(null);
  };

  if (!user?.username) return null;

  const displayName = user.username;
  const avatarLetter = displayName[0]?.toUpperCase() ?? "U";

  return (
    <main className="relative min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-neon glow-primary" />
          <span className="font-semibold tracking-tight">Lumina Meet</span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-full glass px-3 py-1.5 text-sm">
            <div className="h-6 w-6 rounded-full bg-gradient-neon flex items-center justify-center text-[10px] font-bold text-white">
              {avatarLetter}
            </div>
            <span className="text-muted-foreground">{displayName}</span>
          </div>

          <button
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-white/[0.05] border border-white/10 text-muted-foreground
              hover:bg-[oklch(0.72_0.22_35/0.12)] hover:border-[oklch(0.72_0.22_35/0.3)]
              hover:text-[oklch(0.82_0.2_35)] transition-all duration-150 active:scale-[0.97]"
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
          {/* Tab header */}
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-1">
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    bg-[oklch(0.65_0.22_280/0.1)] border border-[oklch(0.65_0.22_280/0.25)]
                    text-[var(--neon-secondary)] hover:bg-[oklch(0.65_0.22_280/0.2)]
                    hover:border-[oklch(0.65_0.22_280/0.45)] transition-all duration-150 active:scale-[0.97]"
                >
                  <Send className="h-3 w-3" />
                  Send invites
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Tab content */}
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
                    <ul className="divide-y divide-white/5 -mx-5">
                      {groups.map((group, i) => (
                        <MeetingGroupRow
                          key={group.meetingId}
                          group={group}
                          index={i}
                          onDeleteRequest={handleDeleteRequest}
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
        onClose={() => {
          setGenOpen(false);
          setGenLink(null);
        }}
        onGenerate={handleGenerate}
      />

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="glass-strong border-white/10">
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
              label="Title (optional — saved to your history)"
              value={joinTitle}
              onChange={(e) => setJoinTitle(e.target.value)}
              placeholder=" "
              onKeyDown={(e) => e.key === "Enter" && join()}
            />
            <NeonButton fullWidth onClick={join}>
              <Video className="h-4 w-4" /> Join meeting
            </NeonButton>
          </div>
        </DialogContent>
      </Dialog>

      <InviteDialog
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          loadHistory();
        }}
      />

      {/* ── Delete meeting modal ────────────────────────────────────────── */}
      <DeleteMeetingModal
        open={deleteTarget !== null}
        meeting={deleteTarget}
        onClose={handleDeleteClose}
        onConfirm={handleDeleteConfirm}
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
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {count}
        </span>
      )}
      {active && (
        <motion.div
          layoutId="tab-underline"
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--neon-primary)] rounded-full"
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
      <div className="h-14 w-14 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
        <History className="h-6 w-6 opacity-20" />
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">No meetings yet</p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">Start one and it'll appear here.</p>
      </div>
      <button
        onClick={onStart}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
          bg-gradient-neon text-white shadow-[0_4px_20px_-6px_oklch(0.65_0.22_280/0.5)]
          hover:shadow-[0_6px_28px_-6px_oklch(0.65_0.22_280/0.75)] hover:brightness-110
          transition-all duration-150 active:scale-[0.97]"
      >
        <Plus className="h-4 w-4" />
        Start your first meeting
      </button>
    </div>
  );
}

// ─── Badge config ─────────────────────────────────────────────────────────────

const BADGE = {
  live: {
    label: "● Live",
    className: "bg-[oklch(0.65_0.22_160/0.15)] text-[var(--neon-secondary)]",
  },
  instant: {
    label: "Instant",
    className: "bg-[oklch(0.65_0.22_320/0.12)] text-[var(--neon-accent)]",
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-[oklch(0.65_0.22_280/0.15)] text-[var(--neon-primary)]",
  },
  joined: {
    label: "Joined",
    className: "bg-[oklch(0.82_0.16_210/0.12)] text-[var(--neon-secondary)]",
  },
  expired: {
    label: "Expired",
    className: "bg-[oklch(0.72_0.22_35/0.15)] text-[oklch(0.82_0.2_35)]",
  },
} as const;

function MeetingTypeBadge({ group }: { group: MeetingGroup }) {
  if (isScheduledExpired(group)) {
    const cfg = BADGE.expired;
    return (
      <span
        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${cfg.className}`}
      >
        {cfg.label}
      </span>
    );
  }
  const key = group.isActive ? "live" : group.type;
  const cfg = BADGE[key as keyof typeof BADGE] ?? BADGE.instant;
  return (
    <span
      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Date line ────────────────────────────────────────────────────────────────

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

// ─── Meeting CTA button ───────────────────────────────────────────────────────

function MeetingCTA({ group }: { group: MeetingGroup }) {
  if (isScheduledExpired(group)) {
    return (
      <span
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
          bg-[oklch(0.72_0.22_35/0.08)] border border-[oklch(0.72_0.22_35/0.2)]
          text-[oklch(0.72_0.22_35/0.6)] cursor-not-allowed select-none"
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
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
          bg-[oklch(0.65_0.22_280/0.1)] border border-[oklch(0.65_0.22_280/0.3)]
          text-[var(--neon-primary)] hover:bg-[oklch(0.65_0.22_280/0.2)]
          hover:border-[oklch(0.65_0.22_280/0.5)] transition-all duration-150 active:scale-[0.97]"
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
        className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
          bg-[oklch(0.65_0.22_160/0.18)] border border-[oklch(0.65_0.22_160/0.4)]
          text-[var(--neon-secondary)] shadow-[0_0_14px_-4px_oklch(0.65_0.22_160/0.5)]
          hover:bg-[oklch(0.65_0.22_160/0.28)] hover:shadow-[0_0_20px_-4px_oklch(0.65_0.22_160/0.7)]
          transition-all duration-150 active:scale-[0.97]"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-secondary)] animate-pulse" />
        Join live
      </Link>
    );
  }

  return (
    <Link
      to="/meeting/$id"
      params={{ id: group.meetingId }}
      onClick={(e) => e.stopPropagation()}
      className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
        bg-white/[0.05] border border-white/10 text-muted-foreground
        hover:bg-[oklch(0.82_0.16_210/0.1)] hover:border-[oklch(0.82_0.16_210/0.25)]
        hover:text-[var(--neon-secondary)] transition-all duration-150 active:scale-[0.97]"
    >
      <RotateCcw className="h-3 w-3" />
      Rejoin
    </Link>
  );
}

// ─── MeetingGroupRow ──────────────────────────────────────────────────────────
//
// CHANGED: accepts onDeleteRequest prop and renders the delete button.
//

function MeetingGroupRow({
  group,
  index,
  onDeleteRequest,
}: {
  group: MeetingGroup;
  index: number;
  onDeleteRequest: (group: MeetingGroup) => void;
}) {
  const [open, setOpen] = useState(false);

  const hasSessions = group.supportsMultipleSessions && group.sessions.length > 0;
  const expired = isScheduledExpired(group);

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, transition: { duration: 0.18 } }}
      transition={{ delay: index * 0.04 }}
      className={expired ? "relative opacity-70 group" : "relative group"}
    >
      {expired && (
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[oklch(0.72_0.22_35/0.5)] rounded-r" />
      )}

      <div
        className={`flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.025] ${
          hasSessions ? "cursor-pointer" : ""
        }`}
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
          className={`flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${
            expired
              ? "bg-[oklch(0.72_0.22_35/0.1)]"
              : group.isActive
                ? "bg-[oklch(0.65_0.22_160/0.18)] ring-1 ring-[oklch(0.65_0.22_160/0.4)]"
                : "bg-white/[0.06]"
          }`}
        >
          {expired ? (
            <AlertTriangle className="h-4 w-4 text-[oklch(0.72_0.22_35)]" />
          ) : group.isActive ? (
            <Activity className="h-4 w-4 text-[var(--neon-secondary)]" />
          ) : group.type === "scheduled" ? (
            <Calendar className="h-4 w-4 text-[var(--neon-primary)]" />
          ) : group.type === "joined" ? (
            <Link2 className="h-4 w-4 text-[var(--neon-secondary)]" />
          ) : (
            <Zap className="h-4 w-4 text-[var(--neon-accent)]" />
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
              <StatPill icon={<AlertTriangle className="h-3 w-3 text-[oklch(0.72_0.22_35)]" />}>
                <span className="text-[oklch(0.72_0.22_35/0.8)]">
                  Was scheduled for {shortDate(group.scheduledFor)} — link no longer valid
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

        {/* ── Action cluster: CTA + Delete ─────────────────────────────── */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <MeetingCTA group={group} />

          {/*
           * Delete button — always visible on hover, always present in DOM.
           * Uses opacity + scale transition so it feels like it "appears".
           * Stops click propagation so the row expand/collapse isn't triggered.
           */}
          <motion.button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest(group);
            }}
            title={group.isActive ? "End meeting before deleting" : "Delete meeting"}
            aria-label="Delete meeting"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-lg border transition-all duration-150",
              "opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100",
              group.isActive
                ? // Active — muted red, cursor blocked, no hover glow (can't delete)
                  "border-[oklch(0.72_0.22_35/0.2)] bg-transparent text-[oklch(0.72_0.22_35/0.35)] cursor-not-allowed"
                : // Deletable — full danger red on hover
                  "border-white/10 bg-transparent text-muted-foreground/50 hover:border-[oklch(0.72_0.22_35/0.45)] hover:bg-[oklch(0.72_0.22_35/0.1)] hover:text-[oklch(0.82_0.2_35)] active:scale-[0.93]",
            )}
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
      <div className="relative border-l border-white/[0.08] pl-5 space-y-0">
        {sessions.map((session, i) => (
          <motion.div
            key={session.sessionId}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="relative py-2.5"
          >
            <span
              className={`absolute -left-[1.4rem] top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border-2 ${
                session.leftAt == null
                  ? "border-[var(--neon-secondary)] bg-[oklch(0.65_0.22_160/0.4)] animate-pulse"
                  : "border-white/20 bg-white/[0.06]"
              }`}
            />

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground/90">
                  {fullDate(session.joinedAt)}
                </p>
                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                  {session.leftAt == null ? (
                    <span className="flex items-center gap-1 text-[11px] text-[var(--neon-secondary)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-secondary)] animate-pulse inline-block" />
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
                className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium
                  bg-white/[0.04] border border-white/[0.08] text-muted-foreground
                  hover:bg-[oklch(0.82_0.16_210/0.1)] hover:border-[oklch(0.82_0.16_210/0.2)]
                  hover:text-[var(--neon-secondary)] transition-all duration-150 active:scale-[0.97]"
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
    <ul className="divide-y divide-white/5 -mx-5">
      {[...Array(4)].map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-4">
          <div className="h-9 w-9 rounded-xl bg-white/[0.04] shimmer flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-48 rounded bg-white/[0.06] shimmer" />
            <div className="h-2.5 w-32 rounded bg-white/[0.04] shimmer" />
          </div>
          <div className="h-7 w-16 rounded-lg bg-white/[0.04] shimmer" />
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
        primary
          ? "bg-gradient-neon text-white shadow-[0_12px_40px_-12px_oklch(0.65_0.22_280/0.7)]"
          : "glass hover:border-white/20"
      }`}
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
            primary
              ? "bg-white/20 text-white hover:bg-white/30"
              : "bg-white/[0.06] border border-white/10 text-[var(--neon-secondary)] group-hover:bg-[oklch(0.65_0.22_280/0.15)] group-hover:border-[oklch(0.65_0.22_280/0.3)]"
          }`}
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

  const handleClose = () => {
    setEmails("");
    setTitle("");
    setResultLink(null);
    onClose();
  };

  const send = async () => {
    const list = emails
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!list.length) {
      toast.error("Add at least one email");
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Add a meeting title");
      return;
    }

    setLoadingInvite(true);
    try {
      const res = await meetingService.generateAndInvite({ emails: list, title: trimmedTitle });
      setResultLink(res.link);
      toast.success(
        `Invites sent to ${res.sent} recipient${res.sent !== 1 ? "s" : ""}${
          res.failed > 0 ? ` (${res.failed} failed)` : ""
        }`,
      );
      setEmails("");
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoadingInvite(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="glass-strong border-white/10">
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
          <NeonButton fullWidth loading={loadingInvite} onClick={send}>
            <Send className="h-4 w-4" />
            {loadingInvite ? "Sending…" : "Send invites"}
          </NeonButton>

          {resultLink && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Meeting link
              </p>
              <p className="text-xs break-all text-[var(--neon-secondary)] font-mono leading-relaxed">
                {resultLink}
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(resultLink).catch(() => {});
                    toast.success("Link copied!");
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    bg-[oklch(0.65_0.22_280/0.1)] border border-[oklch(0.65_0.22_280/0.25)]
                    text-[var(--neon-primary)] hover:bg-[oklch(0.65_0.22_280/0.2)]
                    hover:border-[oklch(0.65_0.22_280/0.45)] transition-all duration-150 active:scale-[0.97]"
                >
                  <Copy className="h-3 w-3" />
                  Copy link
                </button>

                <button
                  onClick={() => setResultLink(null)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                    bg-white/[0.04] border border-white/[0.08] text-muted-foreground
                    hover:bg-white/[0.08] hover:text-foreground transition-all duration-150 active:scale-[0.97]"
                >
                  <RefreshCw className="h-3 w-3" />
                  New meeting
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
