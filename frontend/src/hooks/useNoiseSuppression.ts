/**
 * useNoiseSuppression.ts - Lumina Meet
 *
 * Changes vs previous version:
 *  - Passes `sampleRate: 48000` to AudioContext to match getUserMedia
 *  - Better gain-gate: smoother attack/release, hysteresis to prevent chatter
 *  - Worklet pipeline now sets node parameters (noiseReduction, eqEnabled)
 *  - All existing logic preserved (idempotent toggle, no double-context, etc.)
 */

import { useCallback, useRef, useState } from "react";

export interface NoiseSuppressionReturn {
  noiseSuppressionEnabled: boolean;
  noiseSuppressionSupported: boolean;
  toggleNoiseSuppression: () => Promise<void>;
}

// ─── Improved spectral-gate (gain gate) fallback ──────────────────────────────

interface GainGateHandle {
  processedStream: MediaStream;
  destroy: () => void;
}

function buildGainGate(ctx: AudioContext, sourceTrack: MediaStreamTrack): GainGateHandle {
  const trackStream = new MediaStream([sourceTrack]);
  const source = ctx.createMediaStreamSource(trackStream);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024; // higher res for better floor estimate
  analyser.smoothingTimeConstant = 0.8;

  const gate = ctx.createGain();
  gate.gain.value = 1;

  const dest = ctx.createMediaStreamDestination();

  source.connect(analyser);
  source.connect(gate);
  gate.connect(dest);

  // Calibration: 60 frames × 20 ms = ~1.2 s
  let noiseFloor = 0.002;
  let calibFrames = 0;
  const CALIB_FRAMES = 60;
  const buf = new Uint8Array(analyser.fftSize);

  // Hysteresis state - prevents rapid gate chatter
  let gateOpen = true;
  const OPEN_THRESH_MULT = 3.5; // must be this far above floor to open
  const CLOSE_THRESH_MULT = 2.2; // falls below this to close
  const ATTACK_MS = 8;
  const RELEASE_MS = 80;

  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / buf.length);

    if (calibFrames < CALIB_FRAMES) {
      // Track max RMS during silence for a conservative floor
      if (rms > noiseFloor) noiseFloor = rms;
      calibFrames++;
      return;
    }

    const openThresh = noiseFloor * OPEN_THRESH_MULT;
    const closeThresh = noiseFloor * CLOSE_THRESH_MULT;

    let targetGain: number;
    if (gateOpen) {
      if (rms < closeThresh) {
        gateOpen = false;
        targetGain = 0;
      } else targetGain = 1;
    } else {
      if (rms > openThresh) {
        gateOpen = true;
        targetGain = 1;
      } else targetGain = 0;
    }

    const rampMs = targetGain > 0 ? ATTACK_MS : RELEASE_MS;
    gate.gain.cancelScheduledValues(ctx.currentTime);
    gate.gain.linearRampToValueAtTime(targetGain, ctx.currentTime + rampMs / 1000);

    // Slowly adapt floor upward so sustained speech doesn't raise the floor
    if (rms > noiseFloor && !gateOpen) {
      noiseFloor = noiseFloor * 0.999 + rms * 0.001;
    }
  }, 20);

  const destroy = () => {
    clearInterval(timer);
    try {
      source.disconnect();
    } catch {
      /* ok */
    }
    try {
      gate.disconnect();
    } catch {
      /* ok */
    }
    try {
      analyser.disconnect();
    } catch {
      /* ok */
    }
  };

  return { processedStream: dest.stream, destroy };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNoiseSuppression(
  cameraStreamRef: React.RefObject<MediaStream | null>,
  pcsRef: React.RefObject<Map<string, RTCPeerConnection>>,
  sharedAudioCtxRef?: React.RefObject<AudioContext | null>,
): NoiseSuppressionReturn {
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(false);
  const [noiseSuppressionSupported] = useState(
    () =>
      typeof AudioContext !== "undefined" ||
      typeof (window as any).webkitAudioContext !== "undefined",
  );

  const ownedCtxRef = useRef<AudioContext | null>(null);
  const destroyGateRef = useRef<(() => void) | null>(null);
  const originalTrackRef = useRef<MediaStreamTrack | null>(null);
  const processedTrackRef = useRef<MediaStreamTrack | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    if (sharedAudioCtxRef?.current) return sharedAudioCtxRef.current;
    if (ownedCtxRef.current && ownedCtxRef.current.state !== "closed") {
      return ownedCtxRef.current;
    }
    const ACtx = (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!ACtx) return null;
    // Match getUserMedia sampleRate so no resampling penalty
    const ctx = new ACtx({ sampleRate: 48000 });
    ownedCtxRef.current = ctx;
    return ctx;
  }, [sharedAudioCtxRef]);

  const toggleNoiseSuppression = useCallback(async () => {
    if (!noiseSuppressionSupported) return;
    const camStream = cameraStreamRef.current;
    if (!camStream) return;

    // ── Turn OFF ────────────────────────────────────────────────────────────
    if (noiseSuppressionEnabled) {
      destroyGateRef.current?.();
      destroyGateRef.current = null;

      const origTrack = originalTrackRef.current;
      if (origTrack) {
        const processedTrack = processedTrackRef.current;
        if (processedTrack && processedTrack !== origTrack) {
          camStream.removeTrack(processedTrack);
        }
        if (!camStream.getAudioTracks().includes(origTrack)) {
          camStream.addTrack(origTrack);
        }
        pcsRef.current?.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
          if (sender && origTrack) sender.replaceTrack(origTrack).catch(console.warn);
        });
      }

      if (ownedCtxRef.current) {
        await ownedCtxRef.current.close().catch(() => {
          /* ignore */
        });
        ownedCtxRef.current = null;
      }

      originalTrackRef.current = null;
      processedTrackRef.current = null;
      setNoiseSuppressionEnabled(false);
      return;
    }

    // ── Turn ON ─────────────────────────────────────────────────────────────
    const audioTracks = camStream.getAudioTracks();
    if (!audioTracks.length) return;

    const origTrack = audioTracks[0];
    originalTrackRef.current = origTrack;

    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") await ctx.resume().catch(console.warn);

    let processedTrack: MediaStreamTrack | null = null;
    let usedWorklet = false;

    // 1. Try our new RNNoise-style worklet
    try {
      await ctx.audioWorklet.addModule("/noise-worklet.js");
      const trackStream = new MediaStream([origTrack]);
      const source = ctx.createMediaStreamSource(trackStream);
      const worklet = new AudioWorkletNode(ctx, "noise-suppressor-processor", {
        parameterData: {
          noiseReduction: 0.85,
          eqEnabled: 1,
        },
      });
      const dest = ctx.createMediaStreamDestination();
      source.connect(worklet);
      worklet.connect(dest);
      processedTrack = dest.stream.getAudioTracks()[0] ?? null;
      destroyGateRef.current = () => {
        try {
          source.disconnect();
        } catch {
          /* ok */
        }
        try {
          worklet.disconnect();
        } catch {
          /* ok */
        }
      };
      usedWorklet = true;
    } catch {
      // Worklet unavailable - use improved gain-gate
    }

    // 2. Improved gain-gate fallback
    if (!usedWorklet) {
      const handle = buildGainGate(ctx, origTrack);
      processedTrack = handle.processedStream.getAudioTracks()[0] ?? null;
      destroyGateRef.current = handle.destroy;
    }

    if (!processedTrack) {
      destroyGateRef.current?.();
      destroyGateRef.current = null;
      return;
    }

    processedTrackRef.current = processedTrack;

    camStream.removeTrack(origTrack);
    camStream.addTrack(processedTrack);

    pcsRef.current?.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) sender.replaceTrack(processedTrack!).catch(console.warn);
    });

    setNoiseSuppressionEnabled(true);
    console.info(
      `[NoiseSuppression] Active - ${usedWorklet ? "spectral gate + 3-band EQ worklet" : "hysteresis gain-gate fallback"}`,
    );
  }, [noiseSuppressionEnabled, noiseSuppressionSupported, cameraStreamRef, pcsRef, getCtx]);

  return { noiseSuppressionEnabled, noiseSuppressionSupported, toggleNoiseSuppression };
}
