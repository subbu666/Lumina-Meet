/**
 * useAmbientSound.ts - Lumina Meet
 *
 * Fixes vs previous version:
 *  1. AudioContext is created lazily on first user gesture (satisfies autoplay policy).
 *  2. volumeRef is always current - eliminates the stale closure bug where
 *     the master gain was set to the initial 0.35 even after the user changed it.
 *  3. `toggleSoundscape(null)` and toggling the same soundscape both stop correctly.
 *  4. ctx.resume() is awaited before building any nodes so Safari doesn't
 *     silently fail.
 *  5. Each soundscape builder is pure - only touches nodes it creates, making
 *     teardown reliable with no node leaks.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type SoundscapeId = "rain" | "lofi" | "coffee" | null;

export interface AmbientSoundReturn {
  activeSoundscape: SoundscapeId;
  volume: number;
  setVolume: (v: number) => void;
  toggleSoundscape: (id: SoundscapeId) => void;
  isSupported: boolean;
}

// ─── Noise buffer generators ──────────────────────────────────────────────────

function brownBuffer(ctx: AudioContext, sec = 4): AudioBuffer {
  const n = ctx.sampleRate * sec;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

function pinkBuffer(ctx: AudioContext, sec = 4): AudioBuffer {
  const n = ctx.sampleRate * sec;
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

// ─── Soundscape builders ──────────────────────────────────────────────────────
// Each returns a teardown function. All nodes connect to `master`.

function buildRain(ctx: AudioContext, master: GainNode): () => void {
  const pink = pinkBuffer(ctx);
  const brown = brownBuffer(ctx);

  const pinkSrc = ctx.createBufferSource();
  pinkSrc.buffer = pink;
  pinkSrc.loop = true;

  const brownSrc = ctx.createBufferSource();
  brownSrc.buffer = brown;
  brownSrc.loop = true;

  // Bandpass → steady rain body
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.6;
  // Highpass → distant hiss layer
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2200;
  // Lowpass → deep drip thud
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;

  const gRain = ctx.createGain();
  gRain.gain.value = 0.55;
  const gHiss = ctx.createGain();
  gHiss.gain.value = 0.22;
  const gDrip = ctx.createGain();
  gDrip.gain.value = 0.16;

  pinkSrc.connect(bp);
  bp.connect(gRain);
  gRain.connect(master);
  pinkSrc.connect(hp);
  hp.connect(gHiss);
  gHiss.connect(master);
  brownSrc.connect(lp);
  lp.connect(gDrip);
  gDrip.connect(master);

  pinkSrc.start(0);
  brownSrc.start(0);

  const nodes = [bp, hp, lp, gRain, gHiss, gDrip];
  const sources = [pinkSrc, brownSrc];
  return () => {
    sources.forEach((n) => {
      try {
        n.stop();
      } catch {
        /* ok */
      }
    });
    [...sources, ...nodes].forEach((n) => {
      try {
        n.disconnect();
      } catch {
        /* ok */
      }
    });
  };
}

function buildLofi(ctx: AudioContext, master: GainNode): () => void {
  const brownBuf = brownBuffer(ctx, 5);
  const brownSrc = ctx.createBufferSource();
  brownSrc.buffer = brownBuf;
  brownSrc.loop = true;

  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 400;
  lpf.Q.value = 0.8;
  const gNoise = ctx.createGain();
  gNoise.gain.value = 0.12;

  // Sub-bass hum
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = 50;
  const g1 = ctx.createGain();
  g1.gain.value = 0.018;

  // High melody shimmer with LFO wobble
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.value = 880;
  const g2 = ctx.createGain();
  g2.gain.value = 0.007;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.35;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 9;

  lfo.connect(lfoG);
  lfoG.connect(osc2.frequency);
  brownSrc.connect(lpf);
  lpf.connect(gNoise);
  gNoise.connect(master);
  osc1.connect(g1);
  g1.connect(master);
  osc2.connect(g2);
  g2.connect(master);

  brownSrc.start(0);
  osc1.start(0);
  osc2.start(0);
  lfo.start(0);

  const nodes = [lpf, gNoise, g1, g2, lfoG];
  const sources = [brownSrc, osc1, osc2, lfo];
  return () => {
    sources.forEach((n) => {
      try {
        (n as any).stop();
      } catch {
        /* ok */
      }
    });
    [...sources, ...nodes].forEach((n) => {
      try {
        n.disconnect();
      } catch {
        /* ok */
      }
    });
  };
}

function buildCoffee(ctx: AudioContext, master: GainNode): () => void {
  const brownBuf = brownBuffer(ctx, 5);
  const pinkBuf = pinkBuffer(ctx, 4);

  const roomSrc = ctx.createBufferSource();
  roomSrc.buffer = brownBuf;
  roomSrc.loop = true;

  const chatSrc = ctx.createBufferSource();
  chatSrc.buffer = pinkBuf;
  chatSrc.loop = true;

  const roomBP = ctx.createBiquadFilter();
  roomBP.type = "bandpass";
  roomBP.frequency.value = 600;
  roomBP.Q.value = 0.4;
  const gRoom = ctx.createGain();
  gRoom.gain.value = 0.18;

  const chatBP = ctx.createBiquadFilter();
  chatBP.type = "bandpass";
  chatBP.frequency.value = 1200;
  chatBP.Q.value = 1.2;
  const gChat = ctx.createGain();
  gChat.gain.value = 0.1;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.18;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.05;
  lfo.connect(lfoG);
  lfoG.connect(gChat.gain);

  // Occasional clink sounds via scheduled envelope
  const clink = ctx.createOscillator();
  clink.type = "sine";
  clink.frequency.value = 2100;
  const gClink = ctx.createGain();
  gClink.gain.value = 0;
  const now = ctx.currentTime;
  for (let t = 2; t < 120; t += 5 + Math.random() * 4) {
    gClink.gain.setValueAtTime(0, now + t);
    gClink.gain.linearRampToValueAtTime(0.013, now + t + 0.01);
    gClink.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.28);
  }

  roomSrc.connect(roomBP);
  roomBP.connect(gRoom);
  gRoom.connect(master);
  chatSrc.connect(chatBP);
  chatBP.connect(gChat);
  gChat.connect(master);
  clink.connect(gClink);
  gClink.connect(master);

  roomSrc.start(0);
  chatSrc.start(0);
  clink.start(0);
  lfo.start(0);

  const nodes = [roomBP, gRoom, chatBP, gChat, lfoG, gClink];
  const sources = [roomSrc, chatSrc, clink, lfo];
  return () => {
    sources.forEach((n) => {
      try {
        (n as any).stop();
      } catch {
        /* ok */
      }
    });
    [...sources, ...nodes].forEach((n) => {
      try {
        n.disconnect();
      } catch {
        /* ok */
      }
    });
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAmbientSound(): AmbientSoundReturn {
  const [activeSoundscape, setActiveSoundscape] = useState<SoundscapeId>(null);
  const [volume, setVolumeState] = useState(0.35);

  const [isSupported] = useState(
    () =>
      typeof AudioContext !== "undefined" ||
      typeof (window as any).webkitAudioContext !== "undefined",
  );

  // Refs - never stale inside callbacks
  const volumeRef = useRef(0.35);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const stopCurrentRef = useRef<(() => void) | null>(null);
  const activeSoundscapeRef = useRef<SoundscapeId>(null);

  useEffect(() => {
    activeSoundscapeRef.current = activeSoundscape;
  }, [activeSoundscape]);

  // Lazily create (or resume) the AudioContext - must be called from a user gesture
  const ensureCtx = useCallback(async (): Promise<AudioContext | null> => {
    if (!isSupported) return null;

    if (ctxRef.current && ctxRef.current.state !== "closed") {
      if (ctxRef.current.state === "suspended") {
        await ctxRef.current.resume().catch(console.warn);
      }
      return ctxRef.current;
    }

    const ACtx = (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!ACtx) return null;

    const ctx = new ACtx();
    const master = ctx.createGain();
    master.gain.value = volumeRef.current; // always uses current ref value
    master.connect(ctx.destination);

    ctxRef.current = ctx;
    masterRef.current = master;

    if (ctx.state === "suspended") {
      await ctx.resume().catch(console.warn);
    }
    return ctx;
  }, [isSupported]);

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v;
    setVolumeState(v);
    if (masterRef.current && ctxRef.current) {
      masterRef.current.gain.linearRampToValueAtTime(v, ctxRef.current.currentTime + 0.06);
    }
  }, []);

  const toggleSoundscape = useCallback(
    async (id: SoundscapeId) => {
      if (!isSupported) return;

      // Stop currently running soundscape
      if (stopCurrentRef.current) {
        stopCurrentRef.current();
        stopCurrentRef.current = null;
      }

      // Null means "just stop" - or same id toggled off
      if (id === null || id === activeSoundscapeRef.current) {
        setActiveSoundscape(null);
        return;
      }

      const ctx = await ensureCtx();
      if (!ctx) return;

      // Master might have been recreated; ensure current volume
      if (masterRef.current) {
        masterRef.current.gain.value = volumeRef.current;
      }

      const master = masterRef.current;
      if (!master) return;

      let stopFn: (() => void) | null = null;
      if (id === "rain") stopFn = buildRain(ctx, master);
      else if (id === "lofi") stopFn = buildLofi(ctx, master);
      else if (id === "coffee") stopFn = buildCoffee(ctx, master);

      stopCurrentRef.current = stopFn;
      setActiveSoundscape(id);
    },
    [isSupported, ensureCtx],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCurrentRef.current?.();
      ctxRef.current?.close().catch(() => {
        /* ignore */
      });
    };
  }, []);

  return { activeSoundscape, volume, setVolume, toggleSoundscape, isSupported };
}
