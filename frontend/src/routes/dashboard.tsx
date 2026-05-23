import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";
import { MeetingGenerationModal } from "@/components/modals/MeetingGenerationModal";
import { meetingService, type MeetingGroup, formatDuration } from "@/api/services/meetingService";
import { extractError } from "@/api/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Lumina Meet" }] }),
});

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
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
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

// ─── Main component ───────────────────────────────────────────────────────────

function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  // Modal state
  const [genOpen, setGenOpen] = useState(false);
  const [genLink, setGenLink] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinLink, setJoinLink] = useState("");
  const [joinTitle, setJoinTitle] = useState("");

  // History
  const [groups, setGroups] = useState<MeetingGroup[]>([]);
  const [loading, setLoading] = useState(true);

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

  // ── Instant meeting: modal asks for title first, then we call the API ────────
  const handleOpenGen = () => {
    setGenOpen(true);
    setGenLink(null);
  };

  const handleGenerate = async (title: string) => {
    try {
      const res = await meetingService.generate({ title });
      setGenLink(res.link);
      // Refresh history so the new meeting appears
      loadHistory();
    } catch (err) {
      setGenOpen(false);
      toast.error(extractError(err).message);
    }
  };

  // ── Join via pasted link ──────────────────────────────────────────────────────
  const join = async () => {
    try {
      const url = new URL(joinLink);
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[parts.length - 1];
      if (!id) throw new Error("No ID");

      // Record this joined meeting in the user's history
      const recordTitle = joinTitle.trim() || "Joined meeting";
      try {
        await meetingService.recordJoined({
          meetingLink: joinLink,
          title: recordTitle,
        });
        loadHistory();
      } catch {
        // Non-fatal — still navigate even if recording fails
      }

      navigate({ to: "/meeting/$id", params: { id } });
    } catch {
      toast.error("Enter a valid meeting link");
    }
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
          <NeonButton
            variant="outline"
            onClick={() => {
              logout();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className="h-4 w-4" /> Logout
          </NeonButton>
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

        {/* ── Recent meetings ───────────────────────────────────────────── */}
        <div className="mt-10 glass rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Recent meetings</h2>
              {groups.length > 0 && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {groups.length}
                </span>
              )}
            </div>
            <button
              onClick={() => setInviteOpen(true)}
              className="text-xs text-[var(--neon-secondary)] hover:underline inline-flex items-center gap-1"
            >
              <Send className="h-3 w-3" /> Send invites
            </button>
          </div>

          {loading ? (
            <HistorySkeleton />
          ) : groups.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-3 opacity-20" />
              No meetings yet. Start one above.
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {groups.map((group, i) => (
                <MeetingGroupRow key={group.meetingId} group={group} index={i} />
              ))}
            </ul>
          )}
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

      {/* Join dialog — collects optional title for history recording */}
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
              Join
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
    </main>
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
} as const;

function MeetingTypeBadge({ group }: { group: MeetingGroup }) {
  const key = group.isActive ? "live" : group.type;
  const cfg = BADGE[key] ?? BADGE.instant;
  return (
    <span
      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

// ─── Date line shown in the summary row ───────────────────────────────────────

function MeetingDateLine({ group }: { group: MeetingGroup }) {
  // For scheduled: show the scheduled date (or creation date if in the past)
  if (group.type === "scheduled" && group.scheduledFor) {
    const isPast = group.scheduledFor < Date.now();
    return (
      <StatPill icon={<Calendar className="h-3 w-3" />}>
        {isPast ? "Was " : ""}
        {shortDate(group.scheduledFor)}
      </StatPill>
    );
  }
  // For joined: show when they last joined
  if (group.type === "joined" && group.sessions.length > 0) {
    return (
      <StatPill icon={<Link2 className="h-3 w-3" />}>
        Joined {relativeDate(group.sessions[0].joinedAt)}
      </StatPill>
    );
  }
  // For instant: show link creation date
  return (
    <StatPill icon={<Clock className="h-3 w-3" />}>
      Created {relativeDate(group.createdAt)}
    </StatPill>
  );
}

// ─── MeetingGroupRow ──────────────────────────────────────────────────────────

function MeetingGroupRow({ group, index }: { group: MeetingGroup; index: number }) {
  const [open, setOpen] = useState(false);

  // Sessions are shown for instant and joined; scheduled is single-use
  const hasSessions = group.supportsMultipleSessions && group.sessions.length > 0;

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
    >
      {/* ── Summary row ──────────────────────────────────────────────── */}
      <div
        className={`flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.025] ${
          hasSessions ? "cursor-pointer" : ""
        }`}
        onClick={() => hasSessions && setOpen((v) => !v)}
        role={hasSessions ? "button" : undefined}
        aria-expanded={hasSessions ? open : undefined}
      >
        {/* Expand chevron */}
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

        {/* Icon */}
        <div
          className={`flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center ${
            group.isActive
              ? "bg-[oklch(0.65_0.22_160/0.18)] ring-1 ring-[oklch(0.65_0.22_160/0.4)]"
              : "bg-white/[0.06]"
          }`}
        >
          {group.isActive ? (
            <Activity className="h-4 w-4 text-[var(--neon-secondary)]" />
          ) : group.type === "scheduled" ? (
            <Calendar className="h-4 w-4 text-[var(--neon-primary)]" />
          ) : group.type === "joined" ? (
            <Link2 className="h-4 w-4 text-[var(--neon-secondary)]" />
          ) : (
            <Zap className="h-4 w-4 text-[var(--neon-accent)]" />
          )}
        </div>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate">{group.title}</p>
            <MeetingTypeBadge group={group} />
          </div>

          {/* Stats row */}
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            {/* Session count — only for multi-session types */}
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
          </div>
        </div>

        {/* Rejoin CTA */}
        <Link
          to="/meeting/$id"
          params={{ id: group.meetingId }}
          onClick={(e) => e.stopPropagation()}
          className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg transition ${
            group.isActive
              ? "bg-[oklch(0.65_0.22_160/0.2)] text-[var(--neon-secondary)] hover:bg-[oklch(0.65_0.22_160/0.3)]"
              : "text-[var(--neon-secondary)] hover:underline"
          }`}
        >
          {group.isActive ? "Join live" : group.type === "joined" ? "Rejoin" : "Rejoin"}
        </Link>
      </div>

      {/* ── Session accordion — instant & joined only ─────────────────── */}
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
/**
 * Vertical timeline of all sessions for an instant or joined meeting.
 * Newest session at the top (index 0 after sort).
 */
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
            {/* Timeline dot */}
            <span
              className={`absolute -left-[1.4rem] top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border-2 ${
                session.leftAt == null
                  ? "border-[var(--neon-secondary)] bg-[oklch(0.65_0.22_160/0.4)] animate-pulse"
                  : "border-white/20 bg-white/[0.06]"
              }`}
            />

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                {/* Date + time */}
                <p className="text-[13px] font-medium text-foreground/90">
                  {fullDate(session.joinedAt)}
                </p>

                {/* Duration and status */}
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

              {/* Navigate to this room */}
              <Link
                to="/meeting/$id"
                params={{ id: meetingId }}
                className="flex-shrink-0 text-[11px] text-muted-foreground hover:text-[var(--neon-secondary)] transition"
              >
                ↗
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
    <ul className="divide-y divide-white/5">
      {[...Array(4)].map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-4">
          <div className="h-9 w-9 rounded-xl bg-white/[0.04] shimmer flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-48 rounded bg-white/[0.06] shimmer" />
            <div className="h-2.5 w-32 rounded bg-white/[0.04] shimmer" />
          </div>
          <div className="h-6 w-14 rounded-lg bg-white/[0.04] shimmer" />
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
      <div
        className={`mt-4 inline-flex items-center gap-1 text-xs ${
          primary ? "text-white" : "text-[var(--neon-secondary)]"
        }`}
      >
        <Plus className="h-3 w-3" /> Open
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
      const res = await meetingService.generateAndInvite({
        emails: list,
        title: trimmedTitle,
      });
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
            <Send className="h-4 w-4" /> Send
          </NeonButton>

          {resultLink && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Meeting link (share this)
              </p>
              <p className="text-xs break-all text-[var(--neon-secondary)] font-mono">
                {resultLink}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resultLink).catch(() => {});
                  toast.success("Link copied!");
                }}
                className="text-xs underline text-muted-foreground hover:text-white transition"
              >
                Copy link
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
