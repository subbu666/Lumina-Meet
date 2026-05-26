import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { ArrowLeft, CalendarIcon, Check, Clock, Copy } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { FloatingInput } from "@/components/ui-custom/FloatingInput";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { meetingService } from "@/api/services/meetingService";
import { extractError } from "@/api/apiClient";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/schedule")({
  component: SchedulePage,
  head: () => ({ meta: [{ title: "Schedule meeting — Lumina Meet" }] }),
});

function SchedulePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [time, setTime] = useState("10:00");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ link: string; scheduledFor: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async () => {
    if (!title.trim()) return toast.error("Add a title");
    if (!date) return toast.error("Pick a date");
    const [h, m] = time.split(":").map(Number);
    const scheduled = new Date(date);
    scheduled.setHours(h, m, 0, 0);
    if (scheduled.getTime() < Date.now() - 60_000) return toast.error("Pick a future time");

    setLoading(true);
    try {
      // FIX: send ISO 8601 string — backend validator uses .isISO8601()
      // Previously: scheduledFor: scheduled.getTime()  ← number, caused 400
      const res = await meetingService.schedule({
        title,
        scheduledFor: scheduled.toISOString(),
      });

      // FIX: meetingService.schedule returns { link, meeting }
      // scheduledFor lives inside res.meeting, not at the top level
      const scheduledForMs = res.meeting?.scheduledFor
        ? new Date(res.meeting.scheduledFor).getTime()
        : scheduled.getTime();

      setResult({ link: res.link, scheduledFor: scheduledForMs });
      toast.success("Meeting scheduled");
    } catch (err) {
      toast.error(extractError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="relative min-h-screen px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </button>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong rounded-3xl p-8"
        >
          <h1 className="text-2xl font-semibold tracking-tight">Schedule a meeting</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a date and time. We'll generate a link you can share.
          </p>

          <div className="mt-6 space-y-4">
            <FloatingInput
              label="Meeting title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm hover:bg-white/[0.06] transition",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <CalendarIcon className="h-4 w-4 text-[var(--neon-secondary)]" />
                      {date ? format(date, "PPP") : "Pick a date"}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 glass-strong border-white/10" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3.5">
                <Clock className="h-4 w-4 text-[var(--neon-secondary)]" />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none"
                />
              </div>
            </div>

            <NeonButton fullWidth loading={loading} onClick={submit}>
              {loading ? "Scheduling…" : "Schedule meeting"}
            </NeonButton>
          </div>

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 rounded-2xl border border-[var(--neon-primary)]/30 bg-[var(--neon-primary)]/5 p-4"
            >
              <p className="text-xs uppercase tracking-wider text-[var(--neon-secondary)]">
                Scheduled for
              </p>
              <p className="mt-0.5 text-sm font-medium">
                {new Date(result.scheduledFor).toLocaleString()}
              </p>
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/[0.04] p-2.5">
                <code className="flex-1 truncate text-xs">{result.link}</code>
                <button
                  onClick={copy}
                  className="rounded-lg bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/15 transition flex items-center gap-1"
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
              <div className="mt-3 flex gap-2">
                <Link
                  to="/meeting/$id"
                  params={{ id: result.link.split("/").pop()! }}
                  search={{ scheduledFor: result.scheduledFor }}
                  className="flex-1"
                >
                  <NeonButton variant="outline" fullWidth>
                    Open meeting page
                  </NeonButton>
                </Link>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </main>
  );
}
