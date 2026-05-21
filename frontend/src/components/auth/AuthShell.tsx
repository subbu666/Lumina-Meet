import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative min-h-screen flex items-center justify-center px-4 py-10">
      <Link to="/" className="absolute top-6 left-6 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-gradient-neon glow-primary" />
        <span className="font-semibold tracking-tight">Lumina Meet</span>
      </Link>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="glass-strong w-full max-w-md rounded-3xl p-8 sm:p-10"
      >
        <div className="mb-7 text-center">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </motion.div>
    </main>
  );
}
