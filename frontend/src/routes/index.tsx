import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Video,
  Shield,
  Zap,
  Sparkles,
  Mic,
  MonitorPlay,
  Users,
  MessageSquare,
  Radio,
  Palette,
  BarChart2,
  ListChecks,
  DoorOpen,
  Globe,
  ChevronDown,
  Play,
  Star,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "@/store/authStore";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { CreatorModal } from "@/components/modals/CreatorModal";

// ── Lumina Meet Logo ──────────────────────────────────────────────
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
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id="rg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
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
      <circle cx="14" cy="18" r="4.5" fill="#0B0F19" />
      <circle cx="14" cy="18" r="3" fill="url(#lg-main)" opacity="0.7" />
      <circle cx="14" cy="18" r="1.5" fill="#22d3ee" filter="url(#glow)" />
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

// ── Animated Particle Field ───────────────────────────────────────
function ParticleField() {
  const particles = Array.from({ length: 24 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 6 + 6,
    delay: Math.random() * 4,
    color: i % 3 === 0 ? "#6366f1" : i % 3 === 1 ? "#22d3ee" : "#a78bfa",
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            opacity: 0.4,
          }}
          animate={{
            y: [0, -40, 0],
            x: [0, 20, 0],
            opacity: [0.2, 0.7, 0.2],
            scale: [1, 1.5, 1],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ── Animated Grid Lines ───────────────────────────────────────────
function GridLines() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.04]"
      style={{
        backgroundImage: `
          linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px),
          linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)
        `,
        backgroundSize: "80px 80px",
      }}
    />
  );
}

// ── Stat Counter ──────────────────────────────────────────────────
function StatCounter({
  value,
  label,
  suffix = "",
}: {
  value: string;
  label: string;
  suffix?: string;
}) {
  return (
    <motion.div
      className="text-center"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <div className="text-3xl sm:text-4xl font-bold text-gradient">
        {value}
        {suffix}
      </div>
      <div className="mt-1 text-xs text-muted-foreground uppercase tracking-widest">{label}</div>
    </motion.div>
  );
}

// ── Video Grid Preview ────────────────────────────────────────────
function VideoGridPreview() {
  const tiles = [
    { name: "Alex K.", speaking: true, cam: true, color: "from-indigo-500/30 to-purple-500/30" },
    { name: "Maya R.", speaking: false, cam: true, color: "from-cyan-500/30 to-blue-500/30" },
    { name: "Jordan", speaking: false, cam: false, color: "from-purple-500/30 to-pink-500/30" },
    { name: "Sam T.", speaking: false, cam: true, color: "from-emerald-500/30 to-teal-500/30" },
  ];

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ background: "oklch(0.14 0.02 265)" }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[11px] font-medium text-muted-foreground">lumina-meet.app</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
        </div>
      </div>

      {/* Video grid */}
      <div className="grid grid-cols-2 gap-1.5 p-2">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.name}
            className={`relative rounded-xl aspect-video bg-gradient-to-br ${tile.color} flex items-end p-2 overflow-hidden`}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 + 0.3 }}
          >
            {/* Speaking indicator */}
            {tile.speaking && (
              <motion.div
                className="absolute inset-0 rounded-xl border-2 border-[#22d3ee]"
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
            {/* Avatar or cam off */}
            {!tile.cam && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-sm font-semibold text-white">
                  {tile.name[0]}
                </div>
              </div>
            )}
            {/* Name tag */}
            <div className="relative z-10 flex items-center gap-1.5">
              {tile.speaking && (
                <div className="flex gap-0.5 items-end h-3">
                  {[1, 2, 3].map((b) => (
                    <motion.div
                      key={b}
                      className="w-0.5 rounded-full bg-[#22d3ee]"
                      animate={{ height: ["4px", "12px", "4px"] }}
                      transition={{ duration: 0.6, delay: b * 0.15, repeat: Infinity }}
                    />
                  ))}
                </div>
              )}
              <span className="text-[10px] font-medium text-white/80 bg-black/40 rounded px-1.5 py-0.5">
                {tile.name}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Control bar */}
      <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-white/5">
        {[
          { icon: Mic, active: true, color: "bg-white/10" },
          { icon: Video, active: true, color: "bg-white/10" },
          { icon: MonitorPlay, active: false, color: "bg-white/10" },
          { icon: MessageSquare, active: false, color: "bg-white/10" },
        ].map(({ icon: Icon, active, color }, i) => (
          <motion.div
            key={i}
            className={`h-8 w-8 rounded-full ${color} flex items-center justify-center cursor-pointer`}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
          >
            <Icon className={`h-3.5 w-3.5 ${active ? "text-white" : "text-white/40"}`} />
          </motion.div>
        ))}
        <motion.div
          className="h-8 px-3 rounded-full bg-red-500/80 flex items-center gap-1.5 cursor-pointer"
          whileHover={{ scale: 1.05 }}
        >
          <div className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="text-[10px] font-semibold text-white">REC 02:47</span>
        </motion.div>
      </div>
    </div>
  );
}

// ── Feature Card ──────────────────────────────────────────────────
function FeatureCard({
  icon: Icon,
  title,
  description,
  badge,
  delay = 0,
  accent = "indigo",
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  badge?: string;
  delay?: number;
  accent?: "indigo" | "cyan" | "purple";
}) {
  const accentMap = {
    indigo: { color: "#6366f1", bg: "rgba(99,102,241,0.1)", border: "rgba(99,102,241,0.2)" },
    cyan: { color: "#22d3ee", bg: "rgba(34,211,238,0.1)", border: "rgba(34,211,238,0.2)" },
    purple: { color: "#a78bfa", bg: "rgba(167,139,250,0.1)", border: "rgba(167,139,250,0.2)" },
  };
  const a = accentMap[accent];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="glass rounded-2xl p-5 group cursor-default relative overflow-hidden"
    >
      {/* Hover shimmer */}
      <motion.div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle at 50% 0%, ${a.color}15, transparent 70%)` }}
      />
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl mb-4"
        style={{ background: a.bg, border: `1px solid ${a.border}` }}
      >
        <Icon className="h-5 w-5" style={{ color: a.color }} />
      </div>
      <div className="flex items-center gap-2 mb-1.5">
        <h3 className="font-semibold text-sm">{title}</h3>
        {badge && (
          <span
            className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
            style={{ background: a.bg, color: a.color, border: `1px solid ${a.border}` }}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
}

// ── Layout Mode Card ──────────────────────────────────────────────
function LayoutCard({ title, desc, i }: { title: string; desc: string; i: number }) {
  const icons = ["⊞", "◉", "▬"];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay: i * 0.1 }}
      className="glass rounded-xl p-4 text-center"
    >
      <div className="text-2xl mb-2">{icons[i]}</div>
      <div className="font-semibold text-sm mb-1">{title}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </motion.div>
  );
}

// ── Timeline Step ─────────────────────────────────────────────────
function TimelineStep({
  step,
  title,
  desc,
  delay,
}: {
  step: string;
  title: string;
  desc: string;
  delay: number;
}) {
  return (
    <motion.div
      className="flex gap-4 items-start"
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
    >
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-xs font-bold text-white">
        {step}
      </div>
      <div>
        <div className="font-semibold text-sm">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
    </motion.div>
  );
}

// ── Soundscape Pill ───────────────────────────────────────────────
function SoundscapePill({
  label,
  icon,
  active,
}: {
  label: string;
  icon: string;
  active?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all"
      style={{
        background: active ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.05)",
        border: active ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(255,255,255,0.08)",
        color: active ? "#a5b4fc" : "oklch(0.7 0.03 260)",
      }}
    >
      <span>{icon}</span>
      {label}
      {active && (
        <motion.div className="flex gap-0.5 items-end h-3" animate={{}}>
          {[1, 2, 3].map((b) => (
            <motion.div
              key={b}
              className="w-0.5 rounded-full bg-indigo-400"
              animate={{ height: ["3px", "10px", "3px"] }}
              transition={{ duration: 0.8, delay: b * 0.2, repeat: Infinity }}
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Testimonial Card ──────────────────────────────────────────────
function TestimonialCard({
  quote,
  name,
  role,
  delay,
}: {
  quote: string;
  name: string;
  role: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="glass rounded-2xl p-5"
    >
      <div className="flex gap-0.5 mb-3">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star key={s} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
        ))}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">"{quote}"</p>
      <div className="flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white">
          {name[0]}
        </div>
        <div>
          <div className="text-xs font-semibold">{name}</div>
          <div className="text-[10px] text-muted-foreground">{role}</div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Landing ──────────────────────────────────────────────────
export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Lumina Meet - Cinematic Video Meetings for Modern Teams" },
      {
        name: "description",
        content:
          "Spin up a P2P video room in under 5 seconds. AI noise suppression, background blur, collaborative whiteboard, live polls, ambient soundscapes, and cloud recording - free to start.",
      },
      // OG overrides for the landing page specifically
      { property: "og:title", content: "Lumina Meet - Cinematic Video Meetings for Modern Teams" },
      {
        property: "og:description",
        content:
          "Spin up a P2P video room in under 5 seconds. Whiteboard, polls, noise suppression, cloud recording. Free to start.",
      },
      { property: "og:url", content: import.meta.env.VITE_SITE_URL },
      // Landing page IS indexable - no noindex needed
      { name: "robots", content: "index, follow" },
    ],
    links: [
      // Self-referencing canonical for the landing page
      { rel: "canonical", href: import.meta.env.VITE_SITE_URL },
    ],
  }),
});

function Landing() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const featureTabs = [
    { label: "Collaboration", icon: Users },
    { label: "Audio & Video", icon: Mic },
    { label: "Host Controls", icon: Shield },
  ];

  const tabContent = [
    {
      features: [
        {
          icon: Palette,
          title: "Collaborative Whiteboard",
          description:
            "Full SVG canvas with 8 tools - pen, eraser, text, sticky notes, arrows, shapes. Real-time cursor sharing and 50-step undo/redo.",
          badge: "Live",
          accent: "indigo" as const,
        },
        {
          icon: BarChart2,
          title: "Live Polls",
          description:
            "One active poll per room. Hosts create, close, and dismiss. Results update live with the leading option highlighted.",
          accent: "cyan" as const,
        },
        {
          icon: ListChecks,
          title: "Meeting Agenda",
          description:
            "Timed agenda items with per-item countdown, pause/resume, and a progress bar that turns red in the final 30 seconds.",
          accent: "purple" as const,
        },
        {
          icon: MessageSquare,
          title: "Full-featured Chat",
          description:
            "Reply threading, emoji reactions, typing indicators, private DMs, and unread count badges - all in real time.",
          badge: "Private DMs",
          accent: "indigo" as const,
        },
      ],
    },
    {
      features: [
        {
          icon: Mic,
          title: "Noise Suppression",
          description:
            "RNNoise WASM AudioWorklet removes background noise. Falls back to an auto-calibrated gain-gate if WASM is unavailable.",
          badge: "AI",
          accent: "cyan" as const,
        },
        {
          icon: Video,
          title: "Background Blur",
          description:
            "MediaPipe Selfie Segmentation at ~15 fps. Choose blur, gradient-purple, gradient-teal, or gradient-dark virtual backgrounds.",
          badge: "WASM",
          accent: "indigo" as const,
        },
        {
          icon: Globe,
          title: "Ambient Soundscapes",
          description:
            "Rain, lo-fi, and café soundscapes generated entirely via Web Audio API - no audio files, zero latency, perfectly looped.",
          badge: "Procedural",
          accent: "purple" as const,
        },
        {
          icon: Radio,
          title: "Cloud Recording",
          description:
            "Screen+voice, voice-only, or screen-only modes. Direct Cloudinary upload with live progress. Recording-ready email sent instantly.",
          accent: "cyan" as const,
        },
      ],
    },
    {
      features: [
        {
          icon: DoorOpen,
          title: "Lobby System",
          description:
            "Participants queue with animated waiting steps. Hosts see spring-animated knock toasts with admit/decline buttons and a two-tap chime.",
          badge: "Secure",
          accent: "indigo" as const,
        },
        {
          icon: Shield,
          title: "Host Controls",
          description:
            "Mute, cam-off, remove participants, lower hands, transfer full host or grant co-host status - all from one panel.",
          accent: "purple" as const,
        },
        {
          icon: Users,
          title: "Role System",
          description:
            "Host, co-host (sub-host), and participant roles with granular permissions. Instant role events delivered via Socket.IO.",
          accent: "cyan" as const,
        },
        {
          icon: Zap,
          title: "VAD - Voice Activity",
          description:
            "Dual AudioContext loops with 80 ms polling and 600 ms silence debounce. Highlights the loudest active speaker across all tiles.",
          badge: "Real-time",
          accent: "indigo" as const,
        },
      ],
    },
  ];

  return (
    <>
      <main className="relative min-h-screen">
        {/* ── NAV ─────────────────────────────────────────────────── */}
        <motion.nav
          className="sticky top-0 z-50 px-4 sm:px-6 py-3"
          style={{
            backdropFilter: "blur(20px)",
            background: "oklch(0.16 0.02 265 / 0.85)",
            borderBottom: "1px solid oklch(1 0 0 / 6%)",
          }}
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5">
              <motion.div
                whileHover={{ scale: 1.08, rotate: -4 }}
                transition={{ type: "spring", stiffness: 300, damping: 18 }}
              >
                <LuminaLogo size={32} />
              </motion.div>
              <span className="text-base font-semibold tracking-tight">Lumina Meet</span>
            </Link>

            {/* Center nav links */}
            <div className="hidden md:flex items-center gap-6">
              {["Features", "How it works", "Pricing"].map((item) => (
                <a
                  key={item}
                  href={`#${item.toLowerCase().replace(/\s/g, "-")}`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item}
                </a>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <motion.button
                onClick={() => setCreatorOpen(true)}
                className="hidden sm:inline-flex relative items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium"
                style={{
                  background: "rgba(99,102,241,0.08)",
                  border: "1px solid rgba(99,102,241,0.25)",
                  color: "rgba(165,180,252,0.85)",
                }}
                whileHover={{
                  background: "rgba(99,102,241,0.16)",
                  borderColor: "rgba(34,211,238,0.5)",
                  color: "#22d3ee",
                  boxShadow: "0 0 16px rgba(99,102,241,0.2)",
                }}
                whileTap={{ scale: 0.96 }}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
              >
                <motion.span className="relative flex h-1.5 w-1.5 shrink-0">
                  <motion.span
                    className="absolute inline-flex h-full w-full rounded-full"
                    style={{ background: "#22d3ee", opacity: 0.6 }}
                    animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-1.5 w-1.5"
                    style={{ background: "#22d3ee" }}
                  />
                </motion.span>
                <Sparkles className="h-3 w-3 shrink-0" />
                About Creator
              </motion.button>
              <Link to="/login">
                <NeonButton variant="ghost" className="px-3 py-1.5 text-sm">
                  Log in
                </NeonButton>
              </Link>
              <Link to="/signup">
                <NeonButton className="px-3 py-1.5 text-sm">Get started</NeonButton>
              </Link>
            </div>
          </div>
        </motion.nav>

        {/* ── HERO ─────────────────────────────────────────────────── */}
        <section
          ref={heroRef}
          className="relative min-h-[90vh] flex flex-col items-center justify-center px-4 sm:px-6 pt-10 pb-20 overflow-hidden"
        >
          <GridLines />
          <ParticleField />

          {/* Orb glow effects */}
          <div
            className="pointer-events-none absolute top-1/4 left-1/4 h-96 w-96 rounded-full opacity-20 blur-[120px]"
            style={{ background: "radial-gradient(circle, #6366f1, transparent)" }}
          />
          <div
            className="pointer-events-none absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full opacity-15 blur-[100px]"
            style={{ background: "radial-gradient(circle, #22d3ee, transparent)" }}
          />
          <div
            className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-64 w-64 rounded-full opacity-10 blur-[80px]"
            style={{ background: "radial-gradient(circle, #a78bfa, transparent)" }}
          />

          <motion.div
            style={{ y: heroY, opacity: heroOpacity }}
            className="w-full max-w-5xl mx-auto text-center"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-muted-foreground"
              style={{
                background: "rgba(99,102,241,0.08)",
                border: "1px solid rgba(99,102,241,0.2)",
              }}
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-[#22d3ee]"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              Real-time · WebRTC P2P · 20+ collaborative features
              <span className="ml-1 font-semibold text-indigo-400">Try free →</span>
            </motion.div>

            {/* H1 */}
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-5xl sm:text-7xl lg:text-8xl font-bold tracking-tight leading-[0.95]"
            >
              Meetings that feel
              <br />
              <span className="text-gradient">cinematic.</span>
            </motion.h1>

            {/* Subheading */}
            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="mx-auto mt-6 max-w-2xl text-base sm:text-xl text-muted-foreground px-2 leading-relaxed"
            >
              Spin up secure rooms in seconds. Collaborate with a whiteboard, polls, and agenda.
              Record to the cloud. Built with{" "}
              <span className="text-foreground font-medium">WebRTC P2P</span> for zero-latency video
              - for teams that care about craft.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="mt-8 flex flex-wrap items-center justify-center gap-3"
            >
              <Link to="/signup">
                <NeonButton className="px-7 py-3.5 text-sm font-semibold">
                  Start free - no card needed <ArrowRight className="h-4 w-4" />
                </NeonButton>
              </Link>
              <motion.a
                href="#features"
                className="group inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-sm font-medium text-muted-foreground transition-all hover:text-foreground"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
                whileHover={{
                  background: "rgba(255,255,255,0.07)",
                  borderColor: "rgba(255,255,255,0.15)",
                }}
                whileTap={{ scale: 0.97 }}
              >
                <Play className="h-4 w-4 group-hover:text-indigo-400 transition-colors" />
                See how it works
              </motion.a>
            </motion.div>

            {/* Trust badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-8 flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground"
            >
              {[
                "🔒 End-to-end encrypted",
                "⚡ P2P video - server-free media",
                "🎙️ AI noise suppression",
                "☁️ Cloud recording",
              ].map((badge) => (
                <span key={badge} className="flex items-center gap-1">
                  {badge}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* Hero video preview */}
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="relative mt-16 w-full max-w-3xl mx-auto"
          >
            {/* Glow behind preview */}
            <div
              className="pointer-events-none absolute -inset-4 rounded-3xl opacity-40 blur-2xl"
              style={{
                background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(34,211,238,0.2))",
              }}
            />
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 32px 80px rgba(0,0,0,0.6)" }}
            >
              <VideoGridPreview />
            </div>
          </motion.div>

          {/* Scroll cue */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted-foreground"
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <span className="text-[10px] uppercase tracking-widest">Scroll to explore</span>
            <ChevronDown className="h-4 w-4" />
          </motion.div>
        </section>

        {/* ── STATS ─────────────────────────────────────────────── */}
        <section className="relative py-14 px-4 sm:px-6 border-y border-white/5">
          <div className="mx-auto max-w-4xl">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
              <StatCounter value="< 5s" label="Room creation" />
              <StatCounter value="1000" label="Max participants" suffix="+" />
              <StatCounter value="20" label="Live features" suffix="+" />
              <StatCounter value="P2P" label="Zero-latency video" />
            </div>
          </div>
        </section>

        {/* ── FEATURES (tabbed) ─────────────────────────────────── */}
        <section id="features" className="relative py-20 px-4 sm:px-6 overflow-hidden">
          <div
            className="pointer-events-none absolute top-0 right-0 h-96 w-96 rounded-full opacity-10 blur-[100px]"
            style={{ background: "radial-gradient(circle, #6366f1, transparent)" }}
          />

          <div className="mx-auto max-w-6xl">
            {/* Section header */}
            <motion.div
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="inline-flex items-center gap-2 text-xs text-indigo-400 font-medium uppercase tracking-widest mb-3">
                <span className="h-px w-8 bg-indigo-400/50" />
                Everything you need
                <span className="h-px w-8 bg-indigo-400/50" />
              </div>
              <h2 className="text-3xl sm:text-5xl font-bold tracking-tight">
                Not just video calls. <span className="text-gradient">A collaboration suite.</span>
              </h2>
              <p className="mt-4 text-muted-foreground max-w-xl mx-auto text-sm sm:text-base">
                Every feature you'd expect - and ten you didn't know you needed.
              </p>
            </motion.div>

            {/* Tab switcher */}
            <div className="flex justify-center mb-10">
              <div
                className="inline-flex rounded-xl p-1 gap-1"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                {featureTabs.map(({ label, icon: Icon }, i) => (
                  <motion.button
                    key={label}
                    onClick={() => setActiveTab(i)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all"
                    style={{
                      background: activeTab === i ? "rgba(99,102,241,0.2)" : "transparent",
                      color: activeTab === i ? "#a5b4fc" : "oklch(0.7 0.03 260)",
                      border:
                        activeTab === i
                          ? "1px solid rgba(99,102,241,0.3)"
                          : "1px solid transparent",
                    }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Feature grid */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
              >
                {tabContent[activeTab].features.map((f, i) => (
                  <FeatureCard key={f.title} {...f} delay={i * 0.06} />
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        {/* ── LAYOUT MODES ──────────────────────────────────────── */}
        <section className="py-16 px-4 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <motion.div
              className="glass rounded-3xl p-8 sm:p-12 relative overflow-hidden"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div
                className="pointer-events-none absolute -top-20 -right-20 h-60 w-60 rounded-full opacity-20 blur-[80px]"
                style={{ background: "radial-gradient(circle, #22d3ee, transparent)" }}
              />

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 text-xs text-cyan-400 font-medium uppercase tracking-widest mb-3">
                  <span className="h-px w-6 bg-cyan-400/50" />
                  Three layout modes
                </div>
                <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-2">
                  Your meeting, <span className="text-gradient">your canvas.</span>
                </h2>
                <p className="text-muted-foreground text-sm mb-8 max-w-lg">
                  Switch between layouts on the fly. From adaptive grid to full cinematic spotlight
                  - the room adapts to you.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                  <LayoutCard
                    title="Grid"
                    desc="Responsive tiles: 1→4→9→12. Adapts automatically as participants join or leave."
                    i={0}
                  />
                  <LayoutCard
                    title="Spatial"
                    desc="Drag-and-drop canvas. Position video tiles anywhere. Synced across all peers."
                    i={1}
                  />
                  <LayoutCard
                    title="Cinema"
                    desc="Full-screen spotlight on the active speaker. Footer auto-hides for immersion."
                    i={2}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <SoundscapePill label="Rain" icon="🌧️" active />
                  <SoundscapePill label="Lo-fi" icon="🎵" />
                  <SoundscapePill label="Café" icon="☕" />
                  <span className="flex items-center text-xs text-muted-foreground ml-2">
                    Ambient soundscapes - procedurally generated
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── HOW IT WORKS ──────────────────────────────────────── */}
        <section id="how-it-works" className="py-20 px-4 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left - steps */}
              <div>
                <motion.div
                  className="inline-flex items-center gap-2 text-xs text-purple-400 font-medium uppercase tracking-widest mb-4"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                >
                  <span className="h-px w-6 bg-purple-400/50" />
                  How it works
                </motion.div>
                <motion.h2
                  className="text-2xl sm:text-4xl font-bold tracking-tight mb-8"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                >
                  From zero to meeting
                  <br />
                  <span className="text-gradient">in under 5 seconds.</span>
                </motion.h2>

                <div className="space-y-6">
                  {[
                    {
                      step: "1",
                      title: "Sign up free",
                      desc: "OTP-verified account in seconds. No credit card. No friction.",
                    },
                    {
                      step: "2",
                      title: "Create or schedule a room",
                      desc: "Instant meetings generate a vm-XXXX link. Schedule future meetings with a date/time picker.",
                    },
                    {
                      step: "3",
                      title: "Share the link & invite",
                      desc: "One-click email invites. Participants land in the lobby - you admit them with a single tap.",
                    },
                    {
                      step: "4",
                      title: "Collaborate live",
                      desc: "Whiteboard, polls, agenda, chat, screen share, recording - all from one unified room.",
                    },
                  ].map((s, i) => (
                    <TimelineStep key={s.step} {...s} delay={i * 0.1} />
                  ))}
                </div>
              </div>

              {/* Right - tech highlight */}
              <motion.div
                className="space-y-4"
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <div className="glass rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                      <Zap className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">WebRTC P2P Architecture</div>
                      <div className="text-xs text-muted-foreground">Server-free media streams</div>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                    <p>
                      Video and audio flow{" "}
                      <span className="text-foreground">directly browser-to-browser</span> - the
                      server only relays signaling (SDP + ICE) to establish the connection.
                    </p>
                    <p>
                      Once peers are connected, the server is completely out of the media path. This
                      means <span className="text-foreground">ultra-low latency</span> and no media
                      server costs.
                    </p>
                  </div>
                </div>

                <div className="glass rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="h-8 w-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                      <Shield className="h-4 w-4 text-cyan-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Security-First Design</div>
                      <div className="text-xs text-muted-foreground">Layered defenses</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "JWT rotation",
                      "bcrypt 12x",
                      "Helmet.js",
                      "Redis rate limiting",
                      "CORS strict",
                      "Lobby gate",
                      "Signed uploads",
                    ].map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(34,211,238,0.08)",
                          border: "1px solid rgba(34,211,238,0.15)",
                          color: "#67e8f9",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="glass rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-8 w-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Radio className="h-4 w-4 text-purple-400" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">Cloud Recording Pipeline</div>
                      <div className="text-xs text-muted-foreground">Direct to Cloudinary</div>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px] text-muted-foreground">
                    {[
                      "Screen + Voice → signed upload ticket",
                      "XHR direct → Cloudinary (no server proxy)",
                      "Metadata saved → email sent to host",
                      "Available in dashboard recordings tab",
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-purple-400 font-mono">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── TESTIMONIALS ──────────────────────────────────────── */}
        <section className="py-16 px-4 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <motion.div
              className="text-center mb-10"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">
                Teams that switched to <span className="text-gradient">Lumina Meet</span>
              </h2>
            </motion.div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TestimonialCard
                quote="The noise suppression alone made it worth switching. Our remote standups are finally crystal clear."
                name="Priya S."
                role="Engineering Lead"
                delay={0}
              />
              <TestimonialCard
                quote="The whiteboard and polls in the same room as my video call? This is how it should've always been."
                name="Marcus D."
                role="Product Manager"
                delay={0.1}
              />
              <TestimonialCard
                quote="The cinematic layout and ambient soundscapes make long meetings feel so much less draining."
                name="Amara O."
                role="Design Director"
                delay={0.2}
              />
            </div>
          </div>
        </section>

        {/* ── CTA BANNER ────────────────────────────────────────── */}
        <section className="py-20 px-4 sm:px-6">
          <div className="mx-auto max-w-4xl">
            <motion.div
              className="relative rounded-3xl overflow-hidden p-10 sm:p-16 text-center"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.2 0.06 280), oklch(0.18 0.04 260), oklch(0.2 0.05 210))",
                border: "1px solid rgba(99,102,241,0.3)",
                boxShadow: "0 0 80px rgba(99,102,241,0.15), 0 0 40px rgba(34,211,238,0.08)",
              }}
            >
              {/* Animated mesh background */}
              <div className="pointer-events-none absolute inset-0">
                <div
                  className="absolute top-0 left-0 h-64 w-64 rounded-full opacity-20 blur-[80px]"
                  style={{ background: "radial-gradient(circle, #6366f1, transparent)" }}
                />
                <div
                  className="absolute bottom-0 right-0 h-64 w-64 rounded-full opacity-15 blur-[80px]"
                  style={{ background: "radial-gradient(circle, #22d3ee, transparent)" }}
                />
              </div>

              <div className="relative z-10">
                <motion.div
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium mb-4"
                  style={{
                    background: "rgba(99,102,241,0.15)",
                    border: "1px solid rgba(99,102,241,0.3)",
                    color: "#a5b4fc",
                  }}
                  animate={{
                    boxShadow: [
                      "0 0 0px rgba(99,102,241,0)",
                      "0 0 20px rgba(99,102,241,0.3)",
                      "0 0 0px rgba(99,102,241,0)",
                    ],
                  }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  Free to start. No credit card needed.
                </motion.div>

                <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
                  Ready for meetings
                  <br />
                  <span className="text-gradient">that actually work?</span>
                </h2>

                <p className="text-muted-foreground text-sm sm:text-base mb-8 max-w-md mx-auto">
                  Join teams already using Lumina Meet for their video calls, whiteboard sessions,
                  and recorded stand-ups.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <Link to="/signup">
                    <NeonButton className="px-8 py-4 text-base font-semibold">
                      Create your free room <ArrowRight className="h-5 w-5" />
                    </NeonButton>
                  </Link>
                  <Link to="/login">
                    <NeonButton variant="outline" className="px-8 py-4 text-base">
                      Sign in
                    </NeonButton>
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── FOOTER ────────────────────────────────────────────── */}
        <footer className="py-10 px-4 sm:px-6 border-t border-white/5">
          <div className="mx-auto max-w-6xl flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-2">
              <LuminaLogo size={24} />
              <span className="text-sm font-semibold">Lumina Meet</span>
            </Link>

            <div className="flex flex-wrap gap-6 text-xs text-muted-foreground">
              {["Features", "Pricing", "Privacy", "Terms"].map((item) => (
                <a key={item} href="#" className="hover:text-foreground transition-colors">
                  {item}
                </a>
              ))}
            </div>

            <button
              onClick={() => setCreatorOpen(true)}
              className="group flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-white/70"
            >
              Built with
              <motion.span
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              >
                🌟
              </motion.span>
              by{" "}
              <span className="font-medium">
                <span className="group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:via-cyan-400 group-hover:to-purple-400 group-hover:bg-clip-text group-hover:text-transparent transition-all">
                  Saladi Subrahmanyam
                </span>
              </span>
            </button>
          </div>
        </footer>
      </main>

      <CreatorModal open={creatorOpen} onClose={() => setCreatorOpen(false)} />
    </>
  );
}
