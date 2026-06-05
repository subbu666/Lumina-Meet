/**
 * GenerativeAvatar.tsx - Lumina Meet
 *
 * A deterministic, Canvas-based generative avatar for participants whose
 * camera is off. Replaces the boring gradient + initials circle.
 *
 * Design goals:
 *  - Fully deterministic from username string - same name always produces
 *    same pattern across all clients (no randomness at render time)
 *  - Reacts to VAD: when speaking=true, the geometry pulses outward with
 *    a spring-like animation driven by requestAnimationFrame
 *  - 5 pattern types chosen by username hash: Sacred Geometry, Voronoi-style
 *    Mosaic, Particle Constellation, Flowing Waves, Crystal Lattice
 *  - Each pattern gets a unique oklch color palette derived from the name
 *  - Initials always rendered on top for identity clarity
 *  - Zero dependencies beyond React - pure Canvas 2D API
 */

import { useEffect, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenerativeAvatarProps {
  /** Username - drives ALL visual decisions deterministically */
  username: string;
  /** Whether this participant is currently speaking (from VAD) */
  speaking?: boolean;
  /** Pixel size of the square canvas (default 120) */
  size?: number;
  /** Additional className for the wrapper div */
  className?: string;
}

// ─── Seeded PRNG (Mulberry32) - deterministic, fast ──────────────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Hash username to a stable 32-bit seed ───────────────────────────────────

function hashUsername(name: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

// ─── Derive oklch color palette from seed ────────────────────────────────────

interface Palette {
  bg: string; // deep background
  mid: string; // mid-tone for shapes
  bright: string; // brightest accent
  glow: string; // CSS color for glow effects (raw oklch string)
  hue: number;
  hue2: number;
}

function derivePalette(rng: () => number, seed: number): Palette {
  // Pick a hue from one of the neon-friendly zones: blues, purples, teals, corals
  const hueZones = [210, 250, 280, 305, 160, 35, 60, 180];
  const hue = hueZones[seed % hueZones.length];
  const hue2 = (hue + 40 + Math.floor(rng() * 60)) % 360;
  const chroma = 0.18 + rng() * 0.08; // 0.18–0.26

  return {
    bg: `oklch(0.14 0.03 ${hue})`,
    mid: `oklch(0.45 ${(chroma * 0.8).toFixed(3)} ${hue})`,
    bright: `oklch(0.78 ${chroma.toFixed(3)} ${hue2})`,
    glow: `oklch(0.72 ${chroma.toFixed(3)} ${hue2})`,
    hue,
    hue2,
  };
}

// ─── Pattern Renderers ────────────────────────────────────────────────────────
// Each receives the canvas context, size, rng, palette, and a pulse value 0→1

type Renderer = (
  ctx: CanvasRenderingContext2D,
  size: number,
  rng: () => number,
  pal: Palette,
  pulse: number,
  seed: number,
) => void;

// Pattern 0 - Sacred Geometry (nested polygons + radial lines)
const renderSacredGeometry: Renderer = (ctx, size, rng, pal, pulse) => {
  const cx = size / 2,
    cy = size / 2;
  const base = size * 0.36;
  const sides = [6, 6, 3, 4][Math.floor(rng() * 4)] || 6;

  // Outer glow ring when speaking
  if (pulse > 0.01) {
    const gr = ctx.createRadialGradient(cx, cy, base * 0.6, cx, cy, base * (1.2 + pulse * 0.5));
    gr.addColorStop(0, `oklch(0.72 0.22 ${pal.hue2} / ${(pulse * 0.6).toFixed(2)})`);
    gr.addColorStop(1, `oklch(0.72 0.22 ${pal.hue2} / 0)`);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, base * (1.4 + pulse * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }

  // Background gradient
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.7);
  bg.addColorStop(0, pal.mid);
  bg.addColorStop(1, pal.bg);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Radial guide lines
  const lineCount = sides * 2;
  for (let i = 0; i < lineCount; i++) {
    const angle = (i / lineCount) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * base * 1.1, cy + Math.sin(angle) * base * 1.1);
    ctx.strokeStyle = `oklch(0.65 0.18 ${pal.hue} / 0.25)`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }

  // Nested polygons
  const rings = 4;
  for (let r = rings; r >= 1; r--) {
    const radius = base * (r / rings) * (1 + pulse * 0.08 * (rings - r + 1));
    const rotation = (r * Math.PI) / sides + (r % 2 === 0 ? Math.PI / sides : 0);
    const alpha = 0.15 + (r / rings) * 0.5;
    const lum = 0.35 + (r / rings) * 0.4;

    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2 + rotation;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = `oklch(${lum.toFixed(2)} 0.2 ${pal.hue2} / ${alpha.toFixed(2)})`;
    ctx.lineWidth = 1 + (r / rings) * 1.5;
    ctx.stroke();

    // Inner fill for innermost polygon only
    if (r === 1) {
      ctx.fillStyle = `oklch(0.55 0.18 ${pal.hue} / 0.35)`;
      ctx.fill();
    }
  }

  // Center circle
  const cRadius = base * 0.12 * (1 + pulse * 0.4);
  const cGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cRadius);
  cGrad.addColorStop(0, pal.bright);
  cGrad.addColorStop(1, `oklch(0.65 0.2 ${pal.hue2} / 0.3)`);
  ctx.beginPath();
  ctx.arc(cx, cy, cRadius, 0, Math.PI * 2);
  ctx.fillStyle = cGrad;
  ctx.fill();
};

// Pattern 1 - Voronoi Mosaic (irregular polygon cells)
const renderVoronoiMosaic: Renderer = (ctx, size, rng, pal, pulse, seed) => {
  const cx = size / 2,
    cy = size / 2;

  // Clip to circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  ctx.clip();

  // Background
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.6);
  bg.addColorStop(0, `oklch(0.2 0.04 ${pal.hue})`);
  bg.addColorStop(1, pal.bg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Generate seed points
  const rng2 = mulberry32(seed + 42);
  const pointCount = 14 + Math.floor(rng2() * 8);
  const pts: [number, number][] = [];
  for (let i = 0; i < pointCount; i++) {
    pts.push([rng2() * size, rng2() * size]);
  }

  // Draw each cell as the polygon nearest its seed point
  const cellSize = size / 8;
  const cols = Math.ceil(size / cellSize);
  const rows = Math.ceil(size / cellSize);
  const cells: Record<number, { verts: [number, number][]; idx: number }> = {};

  // Build simple convex cells by finding all grid vertices closest to each seed
  for (let gi = 0; gi <= cols; gi++) {
    for (let gj = 0; gj <= rows; gj++) {
      const gx = gi * cellSize,
        gy = gj * cellSize;
      let closestIdx = 0,
        closestDist = Infinity;
      for (let k = 0; k < pts.length; k++) {
        const dx = gx - pts[k][0],
          dy = gy - pts[k][1];
        const d = dx * dx + dy * dy;
        if (d < closestDist) {
          closestDist = d;
          closestIdx = k;
        }
      }
      if (!cells[closestIdx]) cells[closestIdx] = { verts: [], idx: closestIdx };
      cells[closestIdx].verts.push([gx, gy]);
    }
  }

  // Render cells
  Object.values(cells).forEach(({ verts, idx }) => {
    if (verts.length < 3) return;
    // Convex hull of verts (simple Graham-like sort by angle)
    const [ox, oy] = pts[idx];
    verts.sort((a, b) => Math.atan2(a[1] - oy, a[0] - ox) - Math.atan2(b[1] - oy, b[0] - ox));

    const hue = (pal.hue + idx * 23) % 360;
    const lum = 0.25 + (idx % 5) * 0.08;
    const distFromCenter = Math.sqrt((ox - cx) ** 2 + (oy - cy) ** 2) / (size * 0.7);
    const alpha = 0.5 + (1 - distFromCenter) * 0.4 + pulse * 0.15 * (1 - distFromCenter);

    ctx.beginPath();
    verts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = `oklch(${lum.toFixed(2)} 0.16 ${hue} / ${Math.min(alpha, 0.95).toFixed(2)})`;
    ctx.fill();
    ctx.strokeStyle = `oklch(0.6 0.2 ${pal.hue2} / 0.25)`;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  });

  // Center glow
  if (pulse > 0.02) {
    const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.35 * pulse);
    gl.addColorStop(0, `oklch(0.82 0.22 ${pal.hue2} / ${(pulse * 0.5).toFixed(2)})`);
    gl.addColorStop(1, `oklch(0.82 0.22 ${pal.hue2} / 0)`);
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.35 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

// Pattern 2 - Particle Constellation (dots connected by distance)
const renderConstellation: Renderer = (ctx, size, rng, pal, pulse, seed) => {
  const cx = size / 2,
    cy = size / 2;

  // Clip + background
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  ctx.clip();
  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.6);
  bg.addColorStop(0, `oklch(0.18 0.04 ${pal.hue})`);
  bg.addColorStop(1, pal.bg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  const rng2 = mulberry32(seed + 7);
  const n = 18 + Math.floor(rng2() * 10);
  const pts: [number, number][] = [];

  // Place points inside circle
  for (let i = 0; i < n; i++) {
    const angle = rng2() * Math.PI * 2;
    const r = Math.sqrt(rng2()) * size * 0.42;
    pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }

  const maxDist = size * 0.28;
  const pulseScale = 1 + pulse * 0.12;

  // Connections
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[i][0] - pts[j][0],
        dy = pts[i][1] - pts[j][1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < maxDist) {
        const alpha = (1 - d / maxDist) * (0.3 + pulse * 0.2);
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.strokeStyle = `oklch(0.7 0.18 ${pal.hue2} / ${alpha.toFixed(2)})`;
        ctx.lineWidth = (1 - d / maxDist) * 1.5;
        ctx.stroke();
      }
    }
  }

  // Points
  pts.forEach(([x, y], i) => {
    const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / (size * 0.45);
    const radius = (2.5 + rng2() * 2) * pulseScale * (1 - distFromCenter * 0.4);
    const lum = 0.65 + distFromCenter * 0.15;
    const cGrad = ctx.createRadialGradient(x, y, 0, x, y, radius * 2);
    cGrad.addColorStop(0, `oklch(${lum.toFixed(2)} 0.22 ${(pal.hue + i * 11) % 360})`);
    cGrad.addColorStop(1, `oklch(0.5 0.15 ${pal.hue2} / 0)`);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = cGrad;
    ctx.fill();
  });

  // Central bright node
  const cnRadius = 5 * pulseScale;
  const cnGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cnRadius * 3);
  cnGrad.addColorStop(0, pal.bright);
  cnGrad.addColorStop(0.4, `oklch(0.65 0.22 ${pal.hue2} / 0.6)`);
  cnGrad.addColorStop(1, `oklch(0.5 0.15 ${pal.hue} / 0)`);
  ctx.beginPath();
  ctx.arc(cx, cy, cnRadius, 0, Math.PI * 2);
  ctx.fillStyle = cnGrad;
  ctx.fill();
};

// Pattern 3 - Flowing Waves (layered sine curves)
const renderWaves: Renderer = (ctx, size, rng, pal, pulse, seed) => {
  const cx = size / 2,
    cy = size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  ctx.clip();

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, pal.bg);
  bg.addColorStop(1, `oklch(0.2 0.04 ${pal.hue2})`);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const rng2 = mulberry32(seed + 13);
  const waveCount = 6 + Math.floor(rng2() * 4);
  const baseFreq = 1.5 + rng2() * 2;
  const baseAmp = size * 0.08;

  for (let w = 0; w < waveCount; w++) {
    const freq = baseFreq + w * 0.3;
    const amp = baseAmp * (0.5 + rng2() * 0.8) * (1 + pulse * 0.3);
    const phase = rng2() * Math.PI * 2;
    const yOffset = size * (0.2 + w * (0.6 / waveCount));
    const hueShift = (pal.hue + w * 18) % 360;
    const alpha = 0.12 + (w / waveCount) * 0.25 + pulse * 0.1;
    const lum = 0.3 + (w / waveCount) * 0.35;

    ctx.beginPath();
    ctx.moveTo(0, yOffset);
    for (let x = 0; x <= size; x += 2) {
      const y =
        yOffset +
        Math.sin((x / size) * Math.PI * 2 * freq + phase) * amp +
        Math.sin((x / size) * Math.PI * 2 * freq * 0.7 + phase * 1.3) * amp * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(size, size);
    ctx.lineTo(0, size);
    ctx.closePath();

    const fillGrad = ctx.createLinearGradient(0, yOffset - amp, 0, yOffset + amp * 2);
    fillGrad.addColorStop(
      0,
      `oklch(${(lum + 0.15).toFixed(2)} 0.2 ${hueShift} / ${(alpha * 0.6).toFixed(2)})`,
    );
    fillGrad.addColorStop(0.5, `oklch(${lum.toFixed(2)} 0.18 ${hueShift} / ${alpha.toFixed(2)})`);
    fillGrad.addColorStop(
      1,
      `oklch(${(lum - 0.1).toFixed(2)} 0.15 ${hueShift} / ${(alpha * 0.3).toFixed(2)})`,
    );
    ctx.fillStyle = fillGrad;
    ctx.fill();

    // Stroke the wave line itself
    ctx.beginPath();
    ctx.moveTo(0, yOffset);
    for (let x = 0; x <= size; x += 2) {
      const y =
        yOffset +
        Math.sin((x / size) * Math.PI * 2 * freq + phase) * amp +
        Math.sin((x / size) * Math.PI * 2 * freq * 0.7 + phase * 1.3) * amp * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `oklch(0.72 0.22 ${hueShift} / ${(alpha + 0.15).toFixed(2)})`;
    ctx.lineWidth = 0.8 + w / waveCount;
    ctx.stroke();
  }

  // Center glow when speaking
  if (pulse > 0.05) {
    const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.4 * pulse);
    gl.addColorStop(0, `oklch(0.85 0.2 ${pal.hue2} / ${(pulse * 0.4).toFixed(2)})`);
    gl.addColorStop(1, `oklch(0.85 0.2 ${pal.hue2} / 0)`);
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.4 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};

// Pattern 4 - Crystal Lattice (recursive hexagonal grid)
const renderCrystalLattice: Renderer = (ctx, size, rng, pal, pulse) => {
  const cx = size / 2,
    cy = size / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  ctx.clip();

  const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.6);
  bg.addColorStop(0, `oklch(0.22 0.05 ${pal.hue})`);
  bg.addColorStop(1, pal.bg);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  const hexSize = size * 0.12 * (1 + pulse * 0.06);
  const hexW = hexSize * Math.sqrt(3);
  const hexH = hexSize * 2;
  const cols2 = Math.ceil(size / hexW) + 2;
  const rows2 = Math.ceil(size / (hexH * 0.75)) + 2;

  for (let row = -1; row < rows2; row++) {
    for (let col = -1; col < cols2; col++) {
      const xPos = col * hexW + (row % 2 === 0 ? 0 : hexW * 0.5);
      const yPos = row * hexH * 0.75;
      const distFromCenter = Math.sqrt((xPos - cx) ** 2 + (yPos - cy) ** 2);
      const maxR = size * 0.52;
      if (distFromCenter > maxR) continue;

      const normDist = distFromCenter / maxR;
      const lum = 0.28 + (1 - normDist) * 0.28;
      const alpha = 0.15 + (1 - normDist) * 0.55 + pulse * 0.15 * (1 - normDist);
      const hueShift = (pal.hue + (col * 7 + row * 11)) % 360;

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const hx = xPos + Math.cos(a) * hexSize * 0.92;
        const hy = yPos + Math.sin(a) * hexSize * 0.92;
        i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
      }
      ctx.closePath();

      const hexGrad = ctx.createRadialGradient(xPos, yPos, 0, xPos, yPos, hexSize);
      hexGrad.addColorStop(
        0,
        `oklch(${(lum + 0.12).toFixed(2)} 0.2 ${hueShift} / ${Math.min(alpha, 0.9).toFixed(2)})`,
      );
      hexGrad.addColorStop(
        1,
        `oklch(${lum.toFixed(2)} 0.15 ${hueShift} / ${(alpha * 0.5).toFixed(2)})`,
      );
      ctx.fillStyle = hexGrad;
      ctx.fill();
      ctx.strokeStyle = `oklch(0.65 0.2 ${pal.hue2} / 0.3)`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // Central hex highlight
  const centralHexSize = hexSize * (1.3 + pulse * 0.4);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const hx = cx + Math.cos(a) * centralHexSize;
    const hy = cy + Math.sin(a) * centralHexSize;
    i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  const cGrad2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, centralHexSize);
  cGrad2.addColorStop(0, `oklch(0.7 0.25 ${pal.hue2} / 0.8)`);
  cGrad2.addColorStop(1, `oklch(0.5 0.2 ${pal.hue} / 0.2)`);
  ctx.fillStyle = cGrad2;
  ctx.fill();
  ctx.strokeStyle = `oklch(0.8 0.22 ${pal.hue2} / 0.8)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
};

const PATTERNS: Renderer[] = [
  renderSacredGeometry,
  renderVoronoiMosaic,
  renderConstellation,
  renderWaves,
  renderCrystalLattice,
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function GenerativeAvatar({
  username,
  speaking = false,
  size = 120,
  className,
}: GenerativeAvatarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Derive everything from username - stable across renders
  const seed = hashUsername(username);
  const patternIndex = seed % PATTERNS.length;
  const renderer = PATTERNS[patternIndex];

  // Animation state - only persists inside the RAF loop
  const pulseRef = useRef(0); // current interpolated pulse 0→1
  const targetPulseRef = useRef(0); // target driven by speaking prop
  const rafRef = useRef<number>(0);

  // Extract initials
  const initials =
    username
      .split(/[\s_\-\.]+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  // Memoize palette and rng - recreate only when username changes
  const stableRng = mulberry32(seed);
  const palette = derivePalette(stableRng, seed);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Smooth pulse interpolation - ease in fast, ease out slow
    const target = targetPulseRef.current;
    const current = pulseRef.current;
    const diff = target - current;
    pulseRef.current += diff * (diff > 0 ? 0.12 : 0.04);

    const pulse = pulseRef.current;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Draw the pattern (always a fresh RNG for deterministic output)
    const rng = mulberry32(seed);
    renderer(ctx, size, rng, palette, pulse, seed);

    // Outer speaking ring - rendered above pattern, below initials
    if (pulse > 0.005) {
      const ringAlpha = pulse * 0.9;
      const ringWidth = 2 + pulse * 3;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - ringWidth / 2, 0, Math.PI * 2);
      ctx.strokeStyle = `oklch(0.82 0.22 ${palette.hue2} / ${ringAlpha.toFixed(2)})`;
      ctx.lineWidth = ringWidth;
      ctx.stroke();

      // Secondary outer glow ring
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
      ctx.strokeStyle = `oklch(0.82 0.22 ${palette.hue2} / ${(ringAlpha * 0.3).toFixed(2)})`;
      ctx.lineWidth = ringWidth * 3;
      ctx.stroke();
    }

    // Initials overlay - always visible, scaled to size
    const fontSize = Math.round(size * 0.24);
    ctx.font = `600 ${fontSize}px -apple-system, system-ui, 'Inter', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Text shadow / depth
    ctx.shadowColor = `oklch(0.1 0.02 ${palette.hue} / 0.8)`;
    ctx.shadowBlur = size * 0.08;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = size * 0.01;

    // White text with slight glow when speaking
    if (pulse > 0.05) {
      ctx.fillStyle = `oklch(0.97 0.02 ${palette.hue2})`;
    } else {
      ctx.fillStyle = "oklch(0.97 0.01 250)";
    }
    ctx.fillText(initials, size / 2, size / 2);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    rafRef.current = requestAnimationFrame(draw);
  }, [size, seed, renderer, palette, initials]);

  // Start / stop RAF loop
  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // Update target pulse when speaking changes
  useEffect(() => {
    targetPulseRef.current = speaking ? 1 : 0;
  }, [speaking]);

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        position: "relative",
      }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          borderRadius: "50%",
        }}
        aria-label={`${username}'s avatar`}
        role="img"
      />
    </div>
  );
}

// ─── Compact tile avatar - for the video tile fallback (fills the tile) ───────

/**
 * TileGenerativeAvatar - fills its parent container completely.
 * Use this inside LocalVideoTile / RemoteVideoTile as the cam-off fallback.
 * The size prop should match the actual rendered tile size in px -
 * but since tiles are responsive, we default to 200 and scale via CSS.
 */
export function TileGenerativeAvatar({
  username,
  speaking = false,
}: {
  username: string;
  speaking?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pulseRef = useRef(0);
  const targetPulseRef = useRef(0);
  const rafRef = useRef<number>(0);
  const sizeRef = useRef(200);

  const seed = hashUsername(username);
  const patternIndex = seed % PATTERNS.length;
  const renderer = PATTERNS[patternIndex];

  const initials =
    username
      .split(/[\s_\-\.]+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const stableRng = mulberry32(seed);
  const palette = derivePalette(stableRng, seed);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = sizeRef.current;

    const target = targetPulseRef.current;
    const current = pulseRef.current;
    const diff = target - current;
    pulseRef.current += diff * (diff > 0 ? 0.1 : 0.035);
    const pulse = pulseRef.current;

    ctx.clearRect(0, 0, size, size);

    const rng = mulberry32(seed);
    renderer(ctx, size, rng, palette, pulse, seed);

    // Speaking border ring
    if (pulse > 0.005) {
      const ringAlpha = pulse * 0.85;
      const ringWidth = 3 + pulse * 4;
      ctx.beginPath();
      ctx.rect(0, 0, size, size);
      ctx.strokeStyle = `oklch(0.82 0.22 ${palette.hue2} / ${ringAlpha.toFixed(2)})`;
      ctx.lineWidth = ringWidth * 2;
      ctx.stroke();
    }

    // Initials - larger for tile view
    const fontSize = Math.round(size * 0.22);
    ctx.font = `600 ${fontSize}px -apple-system, system-ui, 'Inter', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = `oklch(0.08 0.02 ${palette.hue} / 0.9)`;
    ctx.shadowBlur = size * 0.06;
    ctx.fillStyle = pulse > 0.05 ? `oklch(0.97 0.03 ${palette.hue2})` : "oklch(0.96 0.01 250)";
    ctx.fillText(initials, size / 2, size / 2);
    ctx.shadowBlur = 0;

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [seed, renderer, palette, initials]);

  // Observe container size and update canvas dimensions
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const size = Math.max(Math.round(Math.min(width, height)), 40);
      sizeRef.current = size;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = size;
        canvas.height = size;
      }
    });

    observer.observe(container);

    // Initial size
    const { width, height } = container.getBoundingClientRect();
    const size = Math.max(Math.round(Math.min(width, height)), 40);
    sizeRef.current = size;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = size;
      canvas.height = size;
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  useEffect(() => {
    targetPulseRef.current = speaking ? 1 : 0;
  }, [speaking]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
        aria-label={`${username}'s generative avatar`}
        role="img"
      />
    </div>
  );
}
