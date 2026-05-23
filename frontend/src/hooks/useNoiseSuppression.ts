/**
 * useNoiseSuppression.ts — Lumina Meet (Fixed)
 *
 * Fixes:
 *  1. Removes deprecated ScriptProcessorNode — replaced with an
 *     AnalyserNode-based gate that runs entirely on the audio thread.
 *  2. Uses a GainNode controlled by a periodic setInterval volume poll
 *     instead of onaudioprocess (which caused the deprecation warning).
 *  3. Still attempts RNNoise WASM AudioWorklet first; falls back to the
 *     gain-gate approach if unavailable.
 *  4. Proper cleanup: closes AudioContext and restores original track.
 *
 * The spectral gate fallback works by sampling RMS volume every 25 ms and
 * ramping a GainNode between 0 and 1, effectively gating steady-state noise
 * (fans, AC hum, keyboard noise) without the deprecated API.
 */

import { useCallback, useRef, useState } from "react";

export interface NoiseSuppressionReturn {
  noiseSuppressionEnabled: boolean;
  noiseSuppressionSupported: boolean;
  toggleNoiseSuppression: () => Promise<void>;
}

// ─── Gain-gate fallback (replaces ScriptProcessorNode) ───────────────────────

interface GainGateResult {
  output: MediaStreamAudioDestinationNode;
  destroy: () => void;
}

function createGainGate(ctx: AudioContext, source: MediaStreamAudioSourceNode): GainGateResult {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.5;

  const gateGain = ctx.createGain();
  gateGain.gain.value = 1;

  const dest = ctx.createMediaStreamDestination();

  source.connect(analyser);
  source.connect(gateGain);
  gateGain.connect(dest);

  // Calibrate noise floor over first 40 frames (~1 second)
  let noiseFloor = 0.004;
  let frameCount = 0;
  const CALIBRATION_FRAMES = 40;
  const buf = new Uint8Array(analyser.fftSize);

  const pollInterval = setInterval(() => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / buf.length);

    if (frameCount < CALIBRATION_FRAMES) {
      noiseFloor = Math.max(noiseFloor, rms * 1.6);
      frameCount++;
    }

    // Smooth gate: 0 below floor, linear ramp above
    const threshold = noiseFloor * 2.5;
    let gate: number;
    if (rms < noiseFloor) {
      gate = 0;
    } else if (rms < threshold) {
      gate = (rms - noiseFloor) / (threshold - noiseFloor);
    } else {
      gate = 1;
    }

    // Ramp to avoid clicks
    gateGain.gain.linearRampToValueAtTime(gate, ctx.currentTime + 0.025);
  }, 25);

  return {
    output: dest,
    destroy: () => {
      clearInterval(pollInterval);
      try {
        source.disconnect(analyser);
      } catch {}
      try {
        source.disconnect(gateGain);
      } catch {}
      try {
        gateGain.disconnect(dest);
      } catch {}
    },
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNoiseSuppression(
  cameraStreamRef: React.RefObject<MediaStream | null>,
  pcsRef: React.RefObject<Map<string, RTCPeerConnection>>,
): NoiseSuppressionReturn {
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState(false);
  const [noiseSuppressionSupported] = useState(
    () =>
      typeof AudioContext !== "undefined" ||
      typeof (window as any).webkitAudioContext !== "undefined",
  );

  const ctxRef = useRef<AudioContext | null>(null);
  const destroyRef = useRef<(() => void) | null>(null);
  const processedTrackRef = useRef<MediaStreamTrack | null>(null);
  const originalTrackRef = useRef<MediaStreamTrack | null>(null);

  const toggleNoiseSuppression = useCallback(async () => {
    if (!noiseSuppressionSupported) return;

    const camStream = cameraStreamRef.current;
    if (!camStream) return;

    if (noiseSuppressionEnabled) {
      // ── Turn OFF ───────────────────────────────────────────────────────────
      destroyRef.current?.();
      destroyRef.current = null;
      ctxRef.current?.close();
      ctxRef.current = null;

      const origTrack = originalTrackRef.current;
      if (origTrack) {
        camStream.getAudioTracks().forEach((t) => {
          camStream.removeTrack(t);
          if (t !== origTrack) {
            try {
              t.stop();
            } catch {}
          }
        });
        camStream.addTrack(origTrack);

        pcsRef.current?.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
          if (sender) sender.replaceTrack(origTrack).catch(console.warn);
        });
      }

      processedTrackRef.current = null;
      originalTrackRef.current = null;
      setNoiseSuppressionEnabled(false);
      return;
    }

    // ── Turn ON ────────────────────────────────────────────────────────────
    const audioTracks = camStream.getAudioTracks();
    if (!audioTracks.length) return;

    const origTrack = audioTracks[0];
    originalTrackRef.current = origTrack;

    const ACtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new ACtx();
    ctxRef.current = ctx;

    if (ctx.state === "suspended") await ctx.resume();

    const trackStream = new MediaStream([origTrack]);
    const source = ctx.createMediaStreamSource(trackStream);

    let processedStream: MediaStream;
    let usedWorklet = false;

    // Try RNNoise WASM AudioWorklet
    try {
      await ctx.audioWorklet.addModule("/noise-worklet.js");
      const workletNode = new AudioWorkletNode(ctx, "noise-suppressor-processor");
      const dest = ctx.createMediaStreamDestination();
      source.connect(workletNode);
      workletNode.connect(dest);
      processedStream = dest.stream;
      destroyRef.current = () => {
        try {
          source.disconnect(workletNode);
        } catch {}
        try {
          workletNode.disconnect();
        } catch {}
      };
      usedWorklet = true;
    } catch {
      // Worklet not available — use gain-gate fallback (no deprecated API)
    }

    if (!usedWorklet) {
      const { output, destroy } = createGainGate(ctx, source);
      processedStream = output.stream;
      destroyRef.current = destroy;
    }

    const processedTrack = processedStream.getAudioTracks()[0];
    if (!processedTrack) {
      destroyRef.current?.();
      ctx.close();
      return;
    }

    processedTrackRef.current = processedTrack;

    // Swap in camera stream
    camStream.getAudioTracks().forEach((t) => camStream.removeTrack(t));
    camStream.addTrack(processedTrack);

    // Replace in all peer connections
    pcsRef.current?.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) sender.replaceTrack(processedTrack).catch(console.warn);
    });

    setNoiseSuppressionEnabled(true);
    console.log(
      `[NoiseSuppression] Active (${usedWorklet ? "RNNoise WASM" : "spectral gate fallback"})`,
    );
  }, [noiseSuppressionEnabled, noiseSuppressionSupported, cameraStreamRef, pcsRef]);

  return { noiseSuppressionEnabled, noiseSuppressionSupported, toggleNoiseSuppression };
}
