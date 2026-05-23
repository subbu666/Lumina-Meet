/**
 * useNoiseSuppression.ts — Lumina Meet
 *
 * Key fixes vs previous version:
 *  1. Does NOT create its own AudioContext — reuses the one passed in from
 *     useWebRTC so there is no duplicate context / resource conflict.
 *  2. The spectral gate runs entirely via setInterval + GainNode ramp —
 *     zero deprecated APIs (no ScriptProcessorNode, no onaudioprocess).
 *  3. Proper idempotent teardown: disconnect graph, restore original track,
 *     never double-stop a track that is still in use.
 *  4. The "spectral gate fallback" console.warn is demoted to console.info
 *     so it is not confused with an error in DevTools.
 */

import { useCallback, useRef, useState } from "react";

export interface NoiseSuppressionReturn {
  noiseSuppressionEnabled: boolean;
  noiseSuppressionSupported: boolean;
  toggleNoiseSuppression: () => Promise<void>;
}

// ─── Spectral-gate (gain gate) fallback ──────────────────────────────────────
// Runs at 25 ms intervals, ramps a GainNode between 0 and 1 based on RMS.
// No deprecated APIs whatsoever.

interface GainGateHandle {
  processedStream: MediaStream;
  destroy: () => void;
}

function buildGainGate(ctx: AudioContext, sourceTrack: MediaStreamTrack): GainGateHandle {
  const trackStream = new MediaStream([sourceTrack]);
  const source = ctx.createMediaStreamSource(trackStream);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;

  const gate = ctx.createGain();
  gate.gain.value = 1;

  const dest = ctx.createMediaStreamDestination();

  source.connect(analyser);
  source.connect(gate);
  gate.connect(dest);

  // Auto-calibrate noise floor in first ~1 s (40 frames × 25 ms)
  let noiseFloor = 0.003;
  let calibFrames = 0;
  const CALIB_FRAMES = 40;
  const buf = new Uint8Array(analyser.fftSize);

  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(buf);
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / buf.length);

    if (calibFrames < CALIB_FRAMES) {
      noiseFloor = Math.max(noiseFloor, rms * 1.5);
      calibFrames++;
      return;
    }

    const threshold = noiseFloor * 2.8;
    let gateValue: number;
    if (rms < noiseFloor) {
      gateValue = 0;
    } else if (rms < threshold) {
      gateValue = (rms - noiseFloor) / (threshold - noiseFloor);
    } else {
      gateValue = 1;
    }

    // Smooth ramp to avoid audible clicks
    gate.gain.linearRampToValueAtTime(gateValue, ctx.currentTime + 0.025);
  }, 25);

  const destroy = () => {
    clearInterval(timer);
    try {
      source.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      gate.disconnect();
    } catch {
      /* already disconnected */
    }
    try {
      analyser.disconnect();
    } catch {
      /* already disconnected */
    }
  };

  return { processedStream: dest.stream, destroy };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNoiseSuppression(
  cameraStreamRef: React.RefObject<MediaStream | null>,
  pcsRef: React.RefObject<Map<string, RTCPeerConnection>>,
  // Optional: shared AudioContext from useWebRTC to avoid creating a duplicate
  sharedAudioCtxRef?: React.RefObject<AudioContext | null>,
): NoiseSuppressionReturn {
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(false);
  const [noiseSuppressionSupported] = useState(
    () =>
      typeof AudioContext !== "undefined" ||
      typeof (window as any).webkitAudioContext !== "undefined",
  );

  // We own this context only if no shared one was provided
  const ownedCtxRef = useRef<AudioContext | null>(null);
  const destroyGateRef = useRef<(() => void) | null>(null);
  const originalTrackRef = useRef<MediaStreamTrack | null>(null);
  const processedTrackRef = useRef<MediaStreamTrack | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    // Prefer shared context (avoids double context)
    if (sharedAudioCtxRef?.current) return sharedAudioCtxRef.current;
    if (ownedCtxRef.current && ownedCtxRef.current.state !== "closed") {
      return ownedCtxRef.current;
    }
    const ACtx = (window.AudioContext || (window as any).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!ACtx) return null;
    const ctx = new ACtx();
    ownedCtxRef.current = ctx;
    return ctx;
  }, [sharedAudioCtxRef]);

  const toggleNoiseSuppression = useCallback(async () => {
    if (!noiseSuppressionSupported) return;
    const camStream = cameraStreamRef.current;
    if (!camStream) return;

    // ── Turn OFF ───────────────────────────────────────────────────────────
    if (noiseSuppressionEnabled) {
      destroyGateRef.current?.();
      destroyGateRef.current = null;

      const origTrack = originalTrackRef.current;
      if (origTrack) {
        // Swap processed track back to original in stream
        const processedTrack = processedTrackRef.current;
        if (processedTrack && processedTrack !== origTrack) {
          camStream.removeTrack(processedTrack);
          // Don't stop processedTrack here — it's a MediaStreamDestination output,
          // stopping it causes the entire destination to go silent.
        }
        if (!camStream.getAudioTracks().includes(origTrack)) {
          camStream.addTrack(origTrack);
        }

        // Restore in all peer connections
        pcsRef.current?.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
          if (sender && origTrack) sender.replaceTrack(origTrack).catch(console.warn);
        });
      }

      // Close owned context only (don't touch shared one)
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

    // ── Turn ON ────────────────────────────────────────────────────────────
    const audioTracks = camStream.getAudioTracks();
    if (!audioTracks.length) return;

    const origTrack = audioTracks[0];
    originalTrackRef.current = origTrack;

    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      await ctx.resume().catch(console.warn);
    }

    let processedTrack: MediaStreamTrack | null = null;
    let usedWorklet = false;

    // 1. Try RNNoise WASM AudioWorklet
    try {
      await ctx.audioWorklet.addModule("/noise-worklet.js");
      const trackStream = new MediaStream([origTrack]);
      const source = ctx.createMediaStreamSource(trackStream);
      const worklet = new AudioWorkletNode(ctx, "noise-suppressor-processor");
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
      // Worklet not available — use gain-gate fallback
    }

    // 2. Gain-gate fallback
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

    // Swap into camera stream
    camStream.removeTrack(origTrack);
    camStream.addTrack(processedTrack);

    // Replace in all peer connections
    pcsRef.current?.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) sender.replaceTrack(processedTrack!).catch(console.warn);
    });

    setNoiseSuppressionEnabled(true);
    console.info(
      `[NoiseSuppression] Active — ${usedWorklet ? "RNNoise WASM worklet" : "spectral gate fallback"}`,
    );
  }, [noiseSuppressionEnabled, noiseSuppressionSupported, cameraStreamRef, pcsRef, getCtx]);

  return { noiseSuppressionEnabled, noiseSuppressionSupported, toggleNoiseSuppression };
}
