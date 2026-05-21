import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Video, Shield, Zap, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
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
        {/* Main gradient: indigo → cyan */}
        <linearGradient id="lg-main" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        {/* Inner glow gradient */}
        <radialGradient id="rg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
        {/* Lens shine */}
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

      {/* Outer rounded square background */}
      <rect x="1" y="1" width="34" height="34" rx="10" fill="url(#lg-main)" opacity="0.15" />
      <rect x="1" y="1" width="34" height="34" rx="10" stroke="url(#lg-main)" strokeWidth="1.5" />

      {/* Radial glow inside */}
      <rect x="1" y="1" width="34" height="34" rx="10" fill="url(#rg-glow)" />

      {/* Video camera body */}
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

      {/* Camera lens circle */}
      <circle cx="14" cy="18" r="4.5" fill="#0B0F19" />
      <circle cx="14" cy="18" r="3" fill="url(#lg-main)" opacity="0.7" />
      <circle cx="14" cy="18" r="1.5" fill="#22d3ee" filter="url(#glow)" />
      {/* Lens shine dot */}
      <circle cx="15.2" cy="16.8" r="0.7" fill="white" opacity="0.6" />

      {/* Camera play/record triangle on right side */}
      <path
        d="M25 14.5 L31 18 L25 21.5 Z"
        fill="url(#lg-main)"
        filter="url(#glow)"
        opacity="0.95"
      />

      {/* Top-right shine overlay on body */}
      <rect x="5" y="11" width="18" height="6" rx="3" fill="url(#lg-shine)" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Lumina Meet — Real-time meetings" },
      {
        name: "description",
        content: "Premium video meeting platform with cinematic UX.",
      },
    ],
  }),
});

function Landing() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [creatorOpen, setCreatorOpen] = useState(false);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  return (
    <>
      <main className="relative min-h-screen px-4 sm:px-6 py-10 sm:py-16">
        {/* NAV */}
        <nav className="mx-auto flex max-w-6xl items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <motion.div
              whileHover={{ scale: 1.08, rotate: -4 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
            >
              <LuminaLogo size={36} />
            </motion.div>
            <span className="text-lg font-semibold tracking-tight">Lumina Meet</span>
          </Link>

          <div className="flex items-center gap-2">
            {/* About Creator — hidden on mobile */}
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
        </nav>

        {/* HERO */}
        <section className="mx-auto mt-20 sm:mt-24 max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-secondary)] animate-pulse" />
            Real-time meetings, reimagined
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="mt-6 text-4xl sm:text-7xl font-semibold tracking-tight leading-[1.05]"
          >
            Meetings that feel <span className="text-gradient">cinematic</span>.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mx-auto mt-5 max-w-xl text-sm sm:text-lg text-muted-foreground px-2"
          >
            Spin up secure rooms in seconds. Schedule with elegance. Invite with one click. Built
            for teams that care about craft.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <Link to="/signup">
              <NeonButton className="px-6 py-3.5">
                Start free <ArrowRight className="h-4 w-4" />
              </NeonButton>
            </Link>
            <Link to="/login">
              <NeonButton variant="outline" className="px-6 py-3.5">
                Log in
              </NeonButton>
            </Link>
          </motion.div>
        </section>

        {/* FEATURES */}
        <section className="mx-auto mt-20 sm:mt-24 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              icon: Zap,
              title: "Instant rooms",
              body: "Generate links in under 5 seconds with a cinematic flow.",
            },
            {
              icon: Shield,
              title: "Secure by default",
              body: "End-to-end encrypted channels with audit trails.",
            },
            {
              icon: Video,
              title: "HD video grid",
              body: "Adaptive grid that looks beautiful from 1 to 49 tiles.",
            },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-neon">
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </motion.div>
          ))}
        </section>

        {/* FOOTER CREDIT */}
        <motion.div
          className="mx-auto mt-20 flex max-w-6xl items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
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
            <span className="font-medium transition-all group-hover:text-transparent">
              <span className="group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:via-cyan-400 group-hover:to-purple-400 group-hover:bg-clip-text group-hover:text-transparent">
                Saladi Subrahmanyam
              </span>
            </span>
          </button>
        </motion.div>
      </main>

      <CreatorModal open={creatorOpen} onClose={() => setCreatorOpen(false)} />
    </>
  );
}
