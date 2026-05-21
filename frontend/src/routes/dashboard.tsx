import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Clock, History, LogOut, Plus, Sparkles, Video, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";
import { MeetingGenerationModal } from "@/components/modals/MeetingGenerationModal";
import { meetingService } from "@/api/services/meetingService";
import { extractError } from "@/api/apiClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Dashboard — Lumina Meet" }] }),
});

type HistoryItem = {
  id: string;
  title: string;
  date: number;
  durationMin: number;
};

function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [genOpen, setGenOpen] = useState(false);
  const [genLink, setGenLink] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [joinLink, setJoinLink] = useState("");
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    meetingService
      .history()
      .then((r) => setItems(Array.isArray(r?.items) ? r.items : []))
      .catch(() => setItems([]));
  }, [user, navigate]);

  const generate = async () => {
    setGenOpen(true);
    setGenLink(null);
    try {
      const res = await meetingService.generate();
      setGenLink(res.link); // now correctly mapped from joinUrl
    } catch (err) {
      setGenOpen(false);
      toast.error(extractError(err).message);
    }
  };

  const join = () => {
    try {
      const url = new URL(joinLink);
      const parts = url.pathname.split("/").filter(Boolean);
      const id = parts[parts.length - 1];
      if (!id) throw new Error();
      navigate({ to: "/meeting/$id", params: { id } });
    } catch {
      toast.error("Enter a valid meeting link");
    }
  };

  // Guard: don't render until user is confirmed valid
  if (!user || !user.username) return null;

  // Safe display values
  const displayName = user.username ?? "User";
  const avatarLetter = displayName[0]?.toUpperCase() ?? "U";

  return (
    <main className="relative min-h-screen px-4 py-6 sm:px-8 sm:py-10">
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

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <ActionCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Instant meeting"
            description="Spin up a room right now."
            primary
            onClick={generate}
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

        <div className="mt-10 glass rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Recent meetings</h2>
            </div>
            <button
              onClick={() => setInviteOpen(true)}
              className="text-xs text-[var(--neon-secondary)] hover:underline inline-flex items-center gap-1"
            >
              <Send className="h-3 w-3" /> Send invites
            </button>
          </div>
          <ul className="divide-y divide-white/5">
            {items.length === 0 && (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                No meetings yet.
              </li>
            )}
            {items.map((m, i) => (
              <motion.li
                key={m.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(m.date).toLocaleString()} · {m.durationMin}m
                  </p>
                </div>
                <Link
                  to="/meeting/$id"
                  params={{ id: m.id }}
                  className="text-xs text-[var(--neon-secondary)] hover:underline shrink-0"
                >
                  Rejoin
                </Link>
              </motion.li>
            ))}
          </ul>
        </div>
      </section>

      <MeetingGenerationModal
        open={genOpen}
        link={genLink}
        onClose={() => {
          setGenOpen(false);
          setGenLink(null);
        }}
      />

      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="glass-strong border-white/10">
          <DialogHeader>
            <DialogTitle>Join a meeting</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <FloatingInput
              label="Meeting link"
              value={joinLink}
              onChange={(e) => setJoinLink(e.target.value)}
              placeholder=" "
            />
            <NeonButton fullWidth onClick={join}>
              Join
            </NeonButton>
          </div>
        </DialogContent>
      </Dialog>

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </main>
  );
}

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

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [emails, setEmails] = useState("");
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const list = emails
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!list.length) return toast.error("Add at least one email");
    setLoading(true);
    try {
      await meetingService.invite({ meetingId: "m_general", emails: list });
      toast.success(`Invites sent to ${list.length}`);
      setEmails("");
      onClose();
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-white/10">
        <DialogHeader>
          <DialogTitle>Send invites</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <FloatingInput
            label="Emails (comma or space separated)"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder=" "
          />
          <NeonButton fullWidth loading={loading} onClick={send}>
            <Send className="h-4 w-4" /> Send
          </NeonButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

void Clock;
