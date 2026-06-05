/**
 * useBackgroundBlur.ts - Lumina Meet
 *
 * Client-side background blur / virtual backgrounds using the
 * MediaPipe Selfie Segmentation WASM model.
 *
 * ARCHITECTURE:
 *   1. Load @mediapipe/selfie_segmentation from CDN (loaded lazily on first use)
 *   2. Feed video frames into the segmentation model at ~15 fps via requestAnimationFrame
 *   3. Composite the result onto a hidden canvas:
 *       • Blur mode: draw blurred bg + sharp person
 *       • Gradient mode: draw gradient bg + sharp person
 *   4. Capture the canvas as a MediaStream via captureStream(15)
 *   5. replaceTrack() on every RTCRtpSender so remote peers see the processed video
 *
 * CDN NOTE:
 *   MediaPipe is loaded from:
 *     https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/
 *   No NPM install needed - the WASM runs entirely in the browser.
 *
 * PERFORMANCE:
 *   The model runs at ~15 fps on a typical laptop. The canvas overlay is
 *   composited at the same rate to save CPU.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type BackgroundMode =
  | "none"
  | "blur"
  | "gradient-purple"
  | "gradient-teal"
  | "gradient-dark";

export interface BackgroundBlurReturn {
  backgroundMode: BackgroundMode;
  setBackgroundMode: (mode: BackgroundMode) => void;
  isProcessing: boolean;
  isSupported: boolean;
}

const SEGMENTATION_FPS = 15;
const FRAME_MS = 1000 / SEGMENTATION_FPS;

const GRADIENT_CONFIGS: Record<string, [string, string]> = {
  "gradient-purple": ["oklch(0.35 0.18 280)", "oklch(0.2 0.1 310)"],
  "gradient-teal": ["oklch(0.35 0.15 200)", "oklch(0.2 0.08 230)"],
  "gradient-dark": ["oklch(0.12 0.02 265)", "oklch(0.08 0.01 280)"],
};

// Dynamically load MediaPipe from CDN
async function loadMediaPipe(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).SelfieSegmentation) {
      resolve((window as any).SelfieSegmentation);
      return;
    }
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/selfie_segmentation.js";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if ((window as any).SelfieSegmentation) resolve((window as any).SelfieSegmentation);
      else reject(new Error("SelfieSegmentation not defined after script load"));
    };
    script.onerror = () => reject(new Error("Failed to load MediaPipe script"));
    document.head.appendChild(script);
  });
}

export function useBackgroundBlur(
  cameraStreamRef: React.RefObject<MediaStream | null>,
  pcsRef: React.RefObject<Map<string, RTCPeerConnection>>,
  localVideoRef: React.RefObject<HTMLVideoElement | null>,
): BackgroundBlurReturn {
  const [backgroundMode, setBackgroundModeState] = useState<BackgroundMode>("none");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupported] = useState(() => {
    return typeof OffscreenCanvas !== "undefined" || typeof HTMLCanvasElement !== "undefined";
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const segmentationRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);
  const processedTrackRef = useRef<MediaStreamTrack | null>(null);
  const originalTrackRef = useRef<MediaStreamTrack | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const lastFrameTimeRef = useRef(0);
  const currentModeRef = useRef<BackgroundMode>("none");

  const stopProcessing = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    // Restore original camera track
    const origTrack = originalTrackRef.current;
    const camStream = cameraStreamRef.current;
    if (origTrack && camStream) {
      camStream.getVideoTracks().forEach((t) => {
        camStream.removeTrack(t);
        if (t !== origTrack)
          try {
            t.stop();
          } catch {}
      });
      camStream.addTrack(origTrack);
      pcsRef.current?.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(origTrack).catch(console.warn);
      });
    }

    processedTrackRef.current = null;
    originalTrackRef.current = null;
    setIsProcessing(false);
  }, [cameraStreamRef, pcsRef]);

  const setBackgroundMode = useCallback(
    async (mode: BackgroundMode) => {
      currentModeRef.current = mode;

      if (mode === "none") {
        stopProcessing();
        setBackgroundModeState("none");
        return;
      }

      if (!isSupported) return;

      const camStream = cameraStreamRef.current;
      if (!camStream) return;

      const videoTracks = camStream.getVideoTracks();
      if (!videoTracks.length) return;

      setBackgroundModeState(mode);

      // If already processing, just change mode - the render loop will pick it up
      if (isProcessing) return;

      setIsProcessing(true);

      // ── Setup canvas ────────────────────────────────────────────────────────
      const { width = 1280, height = 720 } = videoTracks[0].getSettings();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvasRef.current = canvas;

      // ── Hidden video for frame extraction ──────────────────────────────────
      const hiddenVideo = document.createElement("video");
      hiddenVideo.srcObject = new MediaStream([videoTracks[0]]);
      hiddenVideo.autoplay = true;
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.width = width;
      hiddenVideo.height = height;
      hiddenVideoRef.current = hiddenVideo;
      await hiddenVideo.play().catch(() => {});

      // ── Load MediaPipe ──────────────────────────────────────────────────────
      let SelfieSegmentation: any;
      try {
        SelfieSegmentation = await loadMediaPipe();
      } catch (err) {
        console.warn("[BackgroundBlur] MediaPipe unavailable, using blur fallback:", err);
        // Simple CSS blur fallback - just shows blur without segmentation
        startSimpleBlurLoop(canvas, hiddenVideo, camStream, mode);
        return;
      }

      // ── Init segmentation model ─────────────────────────────────────────────
      const segmentation = new SelfieSegmentation({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/${file}`,
      });
      segmentation.setOptions({ modelSelection: 1, selfieMode: true });

      const ctx2d = canvas.getContext("2d")!;

      segmentation.onResults((results: any) => {
        if (currentModeRef.current === "none") return;
        ctx2d.save();
        ctx2d.clearRect(0, 0, width, height);

        const m = currentModeRef.current;

        if (m === "blur") {
          // Draw blurred background
          ctx2d.filter = "blur(18px)";
          ctx2d.drawImage(results.image, 0, 0, width, height);
          ctx2d.filter = "none";
        } else {
          // Draw gradient background
          const [c1, c2] = GRADIENT_CONFIGS[m] ?? ["#1a1a2e", "#0d0d1a"];
          const grad = ctx2d.createLinearGradient(0, 0, width, height);
          grad.addColorStop(0, c1);
          grad.addColorStop(1, c2);
          ctx2d.fillStyle = grad;
          ctx2d.fillRect(0, 0, width, height);
        }

        // Clip to person mask
        ctx2d.globalCompositeOperation = "destination-in";
        ctx2d.drawImage(results.segmentationMask, 0, 0, width, height);

        // Draw original image (person layer)
        ctx2d.globalCompositeOperation = "destination-over";
        ctx2d.drawImage(results.image, 0, 0, width, height);
        ctx2d.restore();
      });

      segmentationRef.current = segmentation;

      // ── Render loop ─────────────────────────────────────────────────────────
      const loop = async (timestamp: number) => {
        if (currentModeRef.current === "none") return;
        if (timestamp - lastFrameTimeRef.current >= FRAME_MS) {
          lastFrameTimeRef.current = timestamp;
          if (hiddenVideo.readyState >= 2) {
            await segmentation.send({ image: hiddenVideo }).catch(() => {});
          }
        }
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);

      // ── Capture canvas as stream ────────────────────────────────────────────
      const processedStream = (canvas as any).captureStream(SEGMENTATION_FPS) as MediaStream;
      const processedTrack = processedStream.getVideoTracks()[0];
      if (!processedTrack) {
        stopProcessing();
        return;
      }

      // Store original track for restoration
      originalTrackRef.current = videoTracks[0];
      processedTrackRef.current = processedTrack;

      // Swap into camera stream
      camStream.getVideoTracks().forEach((t) => camStream.removeTrack(t));
      camStream.addTrack(processedTrack);

      // Replace in all peer connections
      pcsRef.current?.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) sender.replaceTrack(processedTrack).catch(console.warn);
      });
    },
    [isProcessing, isSupported, cameraStreamRef, pcsRef, stopProcessing],
  );

  function startSimpleBlurLoop(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement,
    camStream: MediaStream,
    mode: BackgroundMode,
  ) {
    const ctx2d = canvas.getContext("2d")!;
    const { width, height } = canvas;

    const loop = (timestamp: number) => {
      if (currentModeRef.current === "none") return;
      if (timestamp - lastFrameTimeRef.current >= FRAME_MS) {
        lastFrameTimeRef.current = timestamp;
        ctx2d.save();
        if (mode === "blur") {
          ctx2d.filter = "blur(14px)";
        }
        ctx2d.drawImage(video, 0, 0, width, height);
        ctx2d.restore();
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);

    const processedStream = (canvas as any).captureStream(SEGMENTATION_FPS) as MediaStream;
    const processedTrack = processedStream.getVideoTracks()[0];
    if (!processedTrack) {
      stopProcessing();
      return;
    }

    const videoTracks = camStream.getVideoTracks();
    originalTrackRef.current = videoTracks[0] ?? null;
    processedTrackRef.current = processedTrack;

    camStream.getVideoTracks().forEach((t) => camStream.removeTrack(t));
    camStream.addTrack(processedTrack);
    pcsRef.current?.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) sender.replaceTrack(processedTrack).catch(console.warn);
    });
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopProcessing();
      segmentationRef.current?.close?.();
    };
  }, [stopProcessing]);

  return { backgroundMode, setBackgroundMode, isProcessing, isSupported };
}
