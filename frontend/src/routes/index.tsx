import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Video, Shield, Zap } from "lucide-react";
import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { NeonButton } from "@/components/ui-custom/NeonButton";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "Nebula — Real-time meetings" },
      { name: "description", content: "Premium video meeting platform with cinematic UX." },
    ],
  }),
});

function Landing() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  return (
    <main className="relative min-h-screen px-6 py-10 sm:py-16">
      <nav className="mx-auto flex max-w-6xl items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-neon glow-primary" />
          <span className="text-lg font-semibold tracking-tight">Nebula</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/login">
            <NeonButton variant="ghost">Log in</NeonButton>
          </Link>
          <Link to="/signup">
            <NeonButton>Get started</NeonButton>
          </Link>
        </div>
      </nav>

      <section className="mx-auto mt-24 max-w-4xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-secondary)] animate-pulse" />
          Real-time meetings, reimagined
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
          className="mt-6 text-5xl sm:text-7xl font-semibold tracking-tight leading-[1.05]"
        >
          Meetings that feel <span className="text-gradient">cinematic</span>.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
          className="mx-auto mt-5 max-w-xl text-base sm:text-lg text-muted-foreground"
        >
          Spin up secure rooms in seconds. Schedule with elegance. Invite with one click. Built for teams that care about craft.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Link to="/signup">
            <NeonButton className="px-6 py-3.5">
              Start free <ArrowRight className="h-4 w-4" />
            </NeonButton>
          </Link>
          <Link to="/login">
            <NeonButton variant="outline" className="px-6 py-3.5">Log in</NeonButton>
          </Link>
        </motion.div>
      </section>

      <section className="mx-auto mt-24 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { icon: Zap, title: "Instant rooms", body: "Generate links in under 5 seconds with a cinematic flow." },
          { icon: Shield, title: "Secure by default", body: "End-to-end encrypted channels with audit trails." },
          { icon: Video, title: "HD video grid", body: "Adaptive grid that looks beautiful from 1 to 49 tiles." },
        ].map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
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
    </main>
  );
}
