import { useMemo } from "react";

export function ParticleBackground({ count = 30 }: { count?: number }) {
  const particles = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: Math.random() * 3 + 1,
        delay: Math.random() * 8,
        duration: 6 + Math.random() * 6,
        color: ["var(--neon-primary)", "var(--neon-secondary)", "var(--neon-accent)"][i % 3],
      })),
    [count],
  );

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full animate-float"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 4}px ${p.color}`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            opacity: 0.6,
          }}
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#0B0F19_85%)]" />
    </div>
  );
}
