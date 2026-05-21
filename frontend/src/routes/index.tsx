import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Video, Shield, Zap, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { NeonButton } from "@/components/ui-custom/NeonButton";
import { CreatorModal } from "@/components/modals/CreatorModal";

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
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-neon glow-primary" />
            <span className="text-lg font-semibold tracking-tight">Lumina Meet</span>
          </Link>

          <div className="flex items-center gap-2">
            {/* About Creator — hidden on mobile, shown sm+ */}
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

        {/* FOOTER CREDIT — visible on all screen sizes including mobile */}
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
              ✦
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

      {/* CREATOR MODAL */}
      <CreatorModal open={creatorOpen} onClose={() => setCreatorOpen(false)} />
    </>
  );
}
