/**
 * useDeviceCheck.ts - Lumina Meet
 *
 * Manages the pre-join device-check lobby state:
 *  - Enumerates available cameras / microphones
 *  - Acquires a live preview stream (video + audio)
 *  - Tracks mic/cam toggle state BEFORE entering the room
 *  - Runs a local VAD loop to show the audio level meter
 *  - Exposes device-switch helpers
 *  - Properly cleans up on unmount
 *
 * The stream is handed off to useWebRTC via the join callback so
 * WebRTC never needs to call getUserMedia a second time.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DeviceInfo {
  deviceId: string;
  label: string;
}

export interface UseDeviceCheckReturn {
  /** Live preview stream (null while acquiring or on permission denial) */
  previewStream: MediaStream | null;
  /** Whether getUserMedia is still in flight */
  isAcquiring: boolean;
  /** Error string if getUserMedia was denied / failed */
  permissionError: string | null;
  /** Whether the camera is enabled in the preview */
  micEnabled: boolean;
  /** Whether the camera is enabled in the preview */
  camEnabled: boolean;
  /** 0-100 - updated ~15× per second from the audio analyser */
  audioLevel: number;
  /** List of available video input devices */
  cameras: DeviceInfo[];
  /** List of available audio input devices */
  microphones: DeviceInfo[];
  /** Currently selected camera deviceId */
  selectedCameraId: string;
  /** Currently selected microphone deviceId */
  selectedMicId: string;
  /** Toggle mic track on/off (no re-acquire) */
  toggleMic: () => void;
  /** Toggle camera track on/off - stops track when disabling, re-acquires on enable */
  toggleCam: () => Promise<void>;
  /** Switch to a different camera */
  switchCamera: (deviceId: string) => Promise<void>;
  /** Switch to a different microphone */
  switchMicrophone: (deviceId: string) => Promise<void>;
  /**
   * Call when the user is ready to join.
   * Returns the live stream so the Room component can pass it directly to
   * useWebRTC (avoiding a second getUserMedia call).
   * After this call the hook stops managing the stream - caller owns it.
   */
  confirmAndJoin: () => MediaStream | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VAD_POLL_MS = 66; // ~15 fps

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createSilentBlackStream(): MediaStream {
  // A silent black stream that acts as a safe fallback
  const canvas = Object.assign(document.createElement("canvas"), {
    width: 2,
    height: 2,
  });
  canvas.getContext("2d")?.fillRect(0, 0, 2, 2);
  const videoTrack: MediaStreamTrack = (canvas as any).captureStream(0).getVideoTracks()[0];
  const audioCtx = new AudioContext();
  const dest = audioCtx.createMediaStreamDestination();
  const audioTrack = dest.stream.getAudioTracks()[0];
  const stream = new MediaStream();
  if (videoTrack) stream.addTrack(videoTrack);
  if (audioTrack) stream.addTrack(audioTrack);
  return stream;
}

function getRmsVolume(analyser: AnalyserNode): number {
  const buf = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = (buf[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(100, Math.sqrt(sum / buf.length) * 255 * (100 / 18));
}

async function enumerateDevices(): Promise<{ cameras: DeviceInfo[]; microphones: DeviceInfo[] }> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras: DeviceInfo[] = devices
      .filter((d) => d.kind === "videoinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));
    const microphones: DeviceInfo[] = devices
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
      }));
    return { cameras, microphones };
  } catch {
    return { cameras: [], microphones: [] };
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDeviceCheck(): UseDeviceCheckReturn {
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [isAcquiring, setIsAcquiring] = useState(true);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);
  const [audioLevel, setAudioLevel] = useState(0);
  const [cameras, setCameras] = useState<DeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<DeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [selectedMicId, setSelectedMicId] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const vadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handedOffRef = useRef(false);

  // ── Rebuild audio analyser after stream changes ────────────────────────────
  const rebuildAnalyser = useCallback((stream: MediaStream) => {
    // Tear down old
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    try {
      audioCtxRef.current?.close();
    } catch {}
    audioCtxRef.current = null;
    analyserRef.current = null;

    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      vadTimerRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        setAudioLevel(getRmsVolume(analyserRef.current));
      }, VAD_POLL_MS);
    } catch {
      // AudioContext unavailable (e.g. in test environments)
    }
  }, []);

  // ── Acquire initial stream ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const acquire = async () => {
      setIsAcquiring(true);
      setPermissionError(null);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user",
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 48000,
            channelCount: 1,
          },
        });
      } catch (err: any) {
        // Try audio-only fallback
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
          if (!cancelled) setCamEnabled(false);
        } catch {
          if (!cancelled) {
            setPermissionError(
              err?.name === "NotAllowedError"
                ? "Camera and microphone access was denied. Please allow permissions and refresh."
                : "Could not access your camera or microphone. Check your browser settings.",
            );
            setIsAcquiring(false);
          }
          return;
        }
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      setPreviewStream(stream);
      setIsAcquiring(false);

      // Extract selected device IDs
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      if (videoTrack?.getSettings().deviceId)
        setSelectedCameraId(videoTrack.getSettings().deviceId!);
      if (audioTrack?.getSettings().deviceId) setSelectedMicId(audioTrack.getSettings().deviceId!);

      rebuildAnalyser(stream);

      // Enumerate after getting permissions (labels are available post-grant)
      const { cameras: cams, microphones: mics } = await enumerateDevices();
      if (!cancelled) {
        setCameras(cams);
        setMicrophones(mics);
      }
    };

    acquire();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (vadTimerRef.current) clearInterval(vadTimerRef.current);
      try {
        audioCtxRef.current?.close();
      } catch {}
      // Only stop the preview stream if it hasn't been handed off to the room
      if (!handedOffRef.current) {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Controls ───────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const next = !micEnabled;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    setMicEnabled(next);
    if (!next) setAudioLevel(0);
  }, [micEnabled]);

  const toggleCam = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;

    if (camEnabled) {
      // Disable - stop the track (LED off)
      stream.getVideoTracks().forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });
      // Provide a fresh MediaStream object so React re-renders
      const updated = new MediaStream(stream.getTracks());
      streamRef.current = updated;
      setPreviewStream(updated);
      setCamEnabled(false);
    } else {
      // Enable - re-acquire camera
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined },
        });
        const newTrack = newStream.getVideoTracks()[0];
        if (!newTrack) return;
        stream.getVideoTracks().forEach((t) => {
          t.stop();
          stream.removeTrack(t);
        });
        stream.addTrack(newTrack);
        setSelectedCameraId(newTrack.getSettings().deviceId ?? selectedCameraId);
        const updated = new MediaStream(stream.getTracks());
        streamRef.current = updated;
        setPreviewStream(updated);
        setCamEnabled(true);
      } catch {
        // Permission revoked mid-session - don't throw
      }
    }
  }, [camEnabled, selectedCameraId]);

  const switchCamera = useCallback(async (deviceId: string) => {
    const stream = streamRef.current;
    if (!stream) return;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;
      stream.getVideoTracks().forEach((t) => {
        t.stop();
        stream.removeTrack(t);
      });
      stream.addTrack(newTrack);
      setSelectedCameraId(deviceId);
      setCamEnabled(true);
      const updated = new MediaStream(stream.getTracks());
      streamRef.current = updated;
      setPreviewStream(updated);
    } catch {
      // Device unavailable
    }
  }, []);

  const switchMicrophone = useCallback(
    async (deviceId: string) => {
      const stream = streamRef.current;
      if (!stream) return;
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        const newTrack = newStream.getAudioTracks()[0];
        if (!newTrack) return;
        stream.getAudioTracks().forEach((t) => {
          t.stop();
          stream.removeTrack(t);
        });
        stream.addTrack(newTrack);
        // Re-apply mute state
        newTrack.enabled = micEnabled;
        setSelectedMicId(deviceId);
        const updated = new MediaStream(stream.getTracks());
        streamRef.current = updated;
        setPreviewStream(updated);
        rebuildAnalyser(updated);
      } catch {
        // Device unavailable
      }
    },
    [micEnabled, rebuildAnalyser],
  );

  const confirmAndJoin = useCallback((): MediaStream | null => {
    handedOffRef.current = true;
    // Stop VAD - useWebRTC will build its own AudioContext
    if (vadTimerRef.current) {
      clearInterval(vadTimerRef.current);
      vadTimerRef.current = null;
    }
    try {
      audioCtxRef.current?.close();
    } catch {}
    audioCtxRef.current = null;
    analyserRef.current = null;
    return streamRef.current;
  }, []);

  return {
    previewStream,
    isAcquiring,
    permissionError,
    micEnabled,
    camEnabled,
    audioLevel,
    cameras,
    microphones,
    selectedCameraId,
    selectedMicId,
    toggleMic,
    toggleCam,
    switchCamera,
    switchMicrophone,
    confirmAndJoin,
  };
}
