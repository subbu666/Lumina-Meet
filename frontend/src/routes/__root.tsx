import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { ParticleBackground } from "@/components/effects/ParticleBackground";
import { RateLimitDialog } from "@/components/modals/RateLimitDialog";
import { useAuthStore } from "@/store/authStore";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-strong max-w-md rounded-3xl p-10 text-center">
        <h1 className="text-7xl font-bold text-gradient">404</h1>
        <h2 className="mt-3 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-medium text-white"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="glass-strong max-w-md rounded-3xl p-10 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-xl bg-gradient-neon px-5 py-2.5 text-sm font-medium text-white"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// ─── Canonical origin ─────────────────────────────────────────────
// Replace with your real domain once you deploy.
const SITE_URL = import.meta.env.VITE_SITE_URL;
const OG_IMAGE = `${SITE_URL}/og-image.png`; // 1200×630 - create this separately

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      // ── Charset + viewport ──────────────────────────────────────
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },

      // ── SEO verification tag (Google) ───────────────────────
      { name: "google-site-verification", content: "cda-1J3zM-EProWfhmaORXCcCeCpKBteklmb46UR7sA" },

      // ── Primary SEO ─────────────────────────────────────────────
      { title: "Lumina Meet - Real-time meetings, beautifully fast" },
      {
        name: "description",
        content:
          "Secure P2P video meetings with AI noise suppression, background blur, whiteboard, live polls, ambient soundscapes, and cloud recording.",
      },
      {
        name: "keywords",
        content:
          "video meetings, WebRTC, noise suppression, background blur, whiteboard, cloud recording, team collaboration",
      },
      { name: "author", content: "Saladi Subrahmanyam" },
      { name: "robots", content: "index, follow" },

      // ── Theme ───────────────────────────────────────────────────
      { name: "theme-color", content: "#6366f1" },
      { name: "color-scheme", content: "dark light" },
      { name: "application-name", content: "Lumina Meet" },

      // ── Open Graph ──────────────────────────────────────────────
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Lumina Meet" },
      { property: "og:title", content: "Lumina Meet - Real-time meetings, beautifully fast" },
      {
        property: "og:description",
        content:
          "Secure P2P video meetings with AI noise suppression, background blur, whiteboard, live polls, and cloud recording.",
      },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "Lumina Meet - cinematic video meetings" },

      // ── Twitter / X ─────────────────────────────────────────────
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Lumina Meet - Real-time meetings, beautifully fast" },
      {
        name: "twitter:description",
        content:
          "Secure P2P video meetings with AI noise suppression, whiteboard, polls, and cloud recording.",
      },
      { name: "twitter:image", content: OG_IMAGE },
      { name: "twitter:image:alt", content: "Lumina Meet interface" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },

      // ── Favicon suite ───────────────────────────────────────────
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { rel: "icon", href: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "canonical", href: SITE_URL },

      // ── Preconnect for perf ─────────────────────────────────────
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap",
      },
      { rel: "preconnect", href: "https://res.cloudinary.com" },
    ],
    scripts: [
      // ── JSON-LD structured data ─────────────────────────────────
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Lumina Meet",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          description:
            "Secure P2P video meetings with AI noise suppression, background blur, whiteboard, live polls, ambient soundscapes, and cloud recording.",
          url: SITE_URL,
          logo: `${SITE_URL}/favicon.svg`,
          author: {
            "@type": "Person",
            name: "Saladi Subrahmanyam",
          },
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          featureList: [
            "WebRTC P2P video",
            "AI noise suppression",
            "Background blur",
            "Collaborative whiteboard",
            "Live polls",
            "Ambient soundscapes",
            "Cloud recording",
            "Meeting lobby",
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Inline bootstrap script — runs before React hydrates so there is
 * zero flash-of-wrong-theme (FOWT).
 *
 * Storage key: 'nebula-theme'  (Zustand persist store shape)
 * Reads:  { state: { theme: 'dark' | 'light' } }
 * Falls back to: system preference, then 'dark'.
 *
 * Applies the resolved theme class ('dark' | 'light') to <html> and
 * sets `colorScheme` so the browser scrollbar / form controls also flip.
 */
const themeBootstrap = `(function(){
  try {
    var stored = localStorage.getItem('nebula-theme');
    var theme = 'dark';
    if (stored) {
      var parsed = JSON.parse(stored);
      if (parsed && parsed.state && parsed.state.theme) {
        theme = parsed.state.theme;
      }
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      theme = 'light';
    }
    var root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    root.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
        {/* Flash-of-wrong-theme prevention — must run before first paint */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <QueryClientProvider client={queryClient}>
      <ParticleBackground />
      <Outlet />
      <RateLimitDialog />
      <Toaster richColors theme="dark" position="top-right" />
    </QueryClientProvider>
  );
}
