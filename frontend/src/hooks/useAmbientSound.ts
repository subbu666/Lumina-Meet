/**
 * useAmbientSound.ts — Lumina Meet (Fixed)
 *
 * Fixes:
 *  1. Stale `volume` closure in `ensureCtx` — master gain now always uses
 *     the latest volumeRef value.
 *  2. AudioContext is created on first toggleSoundscape call (user gesture),
 *     which satisfies autoplay policy in all browsers.
 *  3. `toggleSoundscape(null)` correctly stops any active soundscape.
 *  4. Volume slider is fully reactive — ramps gain immediately.
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

// ─── Noise helpers ────────────────────────────────────────────────────────────

function createBrownBuffer(ctx: AudioContext, sec = 4): AudioBuffer {
  const len = ctx.sampleRate * sec;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

function createPinkBuffer(ctx: AudioContext, sec = 4): AudioBuffer {
  const len = ctx.sampleRate * sec;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < len; i++) {
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

function buildRain(ctx: AudioContext, master: GainNode): () => void {
  const pink = createPinkBuffer(ctx);
  const brown = createBrownBuffer(ctx);

  const pinkSrc = ctx.createBufferSource();
  pinkSrc.buffer = pink;
  pinkSrc.loop = true;

  const brownSrc = ctx.createBufferSource();
  brownSrc.buffer = brown;
  brownSrc.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 0.6;

  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 2200;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 180;

  const gRain = ctx.createGain();
  gRain.gain.value = 0.6;
  const gHiss = ctx.createGain();
  gHiss.gain.value = 0.25;
  const gDrip = ctx.createGain();
  gDrip.gain.value = 0.18;

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

  return () => {
    [pinkSrc, brownSrc].forEach((n) => {
      try {
        n.stop();
      } catch {}
      try {
        n.disconnect();
      } catch {}
    });
    [bp, hp, lp, gRain, gHiss, gDrip].forEach((n) => {
      try {
        n.disconnect();
      } catch {}
    });
  };
}

function buildLofi(ctx: AudioContext, master: GainNode): () => void {
  const brownBuf = createBrownBuffer(ctx, 5);
  const brownSrc = ctx.createBufferSource();
  brownSrc.buffer = brownBuf;
  brownSrc.loop = true;

  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = 400;
  lpf.Q.value = 0.8;

  const gNoise = ctx.createGain();
  gNoise.gain.value = 0.15;

  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = 50;
  const g1 = ctx.createGain();
  g1.gain.value = 0.02;

  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.value = 880;
  const g2 = ctx.createGain();
  g2.gain.value = 0.008;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.4;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 8;
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

  return () => {
    [brownSrc, osc1, osc2, lfo].forEach((n) => {
      try {
        (n as any).stop();
      } catch {}
      try {
        n.disconnect();
      } catch {}
    });
    [lpf, gNoise, g1, g2, lfoG].forEach((n) => {
      try {
        n.disconnect();
      } catch {}
    });
  };
}

function buildCoffee(ctx: AudioContext, master: GainNode): () => void {
  const brownBuf = createBrownBuffer(ctx, 5);
  const roomSrc = ctx.createBufferSource();
  roomSrc.buffer = brownBuf;
  roomSrc.loop = true;

  const pinkBuf = createPinkBuffer(ctx, 4);
  const chatSrc = ctx.createBufferSource();
  chatSrc.buffer = pinkBuf;
  chatSrc.loop = true;

  const roomBP = ctx.createBiquadFilter();
  roomBP.type = "bandpass";
  roomBP.frequency.value = 600;
  roomBP.Q.value = 0.4;
  const gRoom = ctx.createGain();
  gRoom.gain.value = 0.2;

  const chatLP = ctx.createBiquadFilter();
  chatLP.type = "bandpass";
  chatLP.frequency.value = 1200;
  chatLP.Q.value = 1.2;
  const gChat = ctx.createGain();
  gChat.gain.value = 0.12;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.18;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 0.06;
  lfo.connect(lfoG);
  lfoG.connect(gChat.gain);

  const clink = ctx.createOscillator();
  clink.type = "sine";
  clink.frequency.value = 2100;
  const gClink = ctx.createGain();
  gClink.gain.value = 0;
  const now = ctx.currentTime;
  for (let t = 2; t < 120; t += 5 + Math.random() * 4) {
    gClink.gain.setValueAtTime(0, now + t);
    gClink.gain.linearRampToValueAtTime(0.015, now + t + 0.01);
    gClink.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.3);
  }

  roomSrc.connect(roomBP);
  roomBP.connect(gRoom);
  gRoom.connect(master);
  chatSrc.connect(chatLP);
  chatLP.connect(gChat);
  gChat.connect(master);
  clink.connect(gClink);
  gClink.connect(master);

  roomSrc.start(0);
  chatSrc.start(0);
  clink.start(0);
  lfo.start(0);

  return () => {
    [roomSrc, chatSrc, clink, lfo].forEach((n) => {
      try {
        (n as any).stop();
      } catch {}
      try {
        n.disconnect();
      } catch {}
    });
    [roomBP, gRoom, chatLP, gChat, lfoG, gClink].forEach((n) => {
      try {
        n.disconnect();
      } catch {}
    });
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAmbientSound(): AmbientSoundReturn {
  const [activeSoundscape, setActiveSoundscape] = useState<SoundscapeId>(null);
  const [volume, setVolumeState] = useState(0.35);
  const volumeRef = useRef(0.35); // always up-to-date, no stale closure

  const [isSupported] = useState(
    () =>
      typeof AudioContext !== "undefined" ||
      typeof (window as any).webkitAudioContext !== "undefined",
  );

  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const stopCurrentRef = useRef<(() => void) | null>(null);
  const activeSoundscapeRef = useRef<SoundscapeId>(null);

  // Keep ref in sync
  useEffect(() => {
    activeSoundscapeRef.current = activeSoundscape;
  }, [activeSoundscape]);

  const ensureCtx = useCallback((): AudioContext => {
    if (ctxRef.current && ctxRef.current.state !== "closed") return ctxRef.current;
    const ACtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new ACtx();
    const master = ctx.createGain();
    master.gain.value = volumeRef.current; // use ref, not closure
    master.connect(ctx.destination);
    ctxRef.current = ctx;
    masterGainRef.current = master;
    return ctx;
  }, []); // no dependencies — volumeRef handles freshness

  const setVolume = useCallback((v: number) => {
    volumeRef.current = v;
    setVolumeState(v);
    if (masterGainRef.current && ctxRef.current) {
      masterGainRef.current.gain.linearRampToValueAtTime(v, ctxRef.current.currentTime + 0.05);
    }
  }, []);

  const toggleSoundscape = useCallback(
    (id: SoundscapeId) => {
      if (!isSupported) return;

      const ctx = ensureCtx();
      if (ctx.state === "suspended") ctx.resume();

      // Stop existing soundscape
      if (stopCurrentRef.current) {
        stopCurrentRef.current();
        stopCurrentRef.current = null;
      }

      // If same id or null — just stop
      if (id === null || id === activeSoundscapeRef.current) {
        setActiveSoundscape(null);
        return;
      }

      const master = masterGainRef.current!;
      master.gain.value = volumeRef.current;

      let stopFn: (() => void) | null = null;
      if (id === "rain") stopFn = buildRain(ctx, master);
      else if (id === "lofi") stopFn = buildLofi(ctx, master);
      else if (id === "coffee") stopFn = buildCoffee(ctx, master);

      stopCurrentRef.current = stopFn;
      setActiveSoundscape(id);
    },
    [isSupported, ensureCtx],
  );

  useEffect(() => {
    return () => {
      stopCurrentRef.current?.();
      ctxRef.current?.close();
    };
  }, []);

  return { activeSoundscape, volume, setVolume, toggleSoundscape, isSupported };
}
