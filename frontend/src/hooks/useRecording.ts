/**
 * useRecording — Lumina Meet
 *
 * Refactored v2 — all stale-closure and ref-sync bugs fixed.
 *
 * Key changes from original:
 *  • Callback refs are assigned synchronously in the render body (not inside
 *    useEffect) so the interval closure always reads the latest handler even
 *    when the parent re-renders between ticks.
 *  • The options object is never depended upon as a whole — only the individual
 *    callback values are extracted, which are now stable useCallback refs in
 *    the parent.
 *  • warnFiredRef and limitExceededRef reset correctly on every new recording.
 *  • Timer cleanup is robust: cleared in onstop AND on hard-stop path so there
 *    is never a dangling interval.
 *
 * Recording modes:
 *  "screen_voice" — screen share + microphone
 *  "voice"        — microphone only (audio/webm)
 *  "screen"       — screen video only (no audio)
 *
 * Limit constants (mirror backend constants/index.js):
 *  MAX_RECORDING_DURATION_SEC   = 300  (5 min hard cap)
 *  RECORDING_WARNING_BEFORE_SEC = 60   (warn at 4:00 mark)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { API_ENDPOINTS } from "@/api/endpoints";

// ─── Shared limit constants ───────────────────────────────────────────────────

export const MAX_RECORDING_DURATION_SEC = 5 * 60; // 300 s = 5 min
export const MAX_RECORDING_DURATION_MIN = 5;
export const RECORDING_WARNING_BEFORE_SEC = 60; // warn at 4:00 remaining

// ─── Types ────────────────────────────────────────────────────────────────────

export type RecordingMode = "screen_voice" | "voice" | "screen";

export interface RecordingEntry {
  recordingId: string;
  mode: RecordingMode;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
  durationSec: number;
  fileSizeBytes: number;
  meetingId: string;
  createdAt: number;
  thumbnailUrl?: string;
}

export interface UseRecordingOptions {
  /**
   * Called exactly once when RECORDING_WARNING_BEFORE_SEC seconds remain.
   * Must be a stable reference (useCallback) in the parent component.
   */
  onApproachingLimit?: () => void;
  /**
   * Called exactly once when the hard cap is hit and the recorder is
   * force-stopped. Must be a stable reference (useCallback) in the parent.
   */
  onLimitExceeded?: () => void;
}

export interface UseRecordingReturn {
  isRecording: boolean;
  recordingMode: RecordingMode | null;
  recordingDurationSec: number;
  startRecording: (mode: RecordingMode) => Promise<void>;
  stopRecording: () => void;
  uploadProgress: number;
  isUploading: boolean;
  lastRecording: RecordingEntry | null;
  error: string | null;
}

// ─── Upload time estimator ────────────────────────────────────────────────────

const BITRATE_VOICE_KBPS = 128;
const BITRATE_SCREEN_KBPS = 2500;
const BITRATE_SCREEN_VOICE_KBPS = 2800;
const UPLOAD_MBPS = 1.5;

function estimatedFileSizeMB(mode: RecordingMode, durationSec: number): number {
  const kbps =
    mode === "voice"
      ? BITRATE_VOICE_KBPS
      : mode === "screen"
        ? BITRATE_SCREEN_KBPS
        : BITRATE_SCREEN_VOICE_KBPS;
  return (kbps * durationSec) / 8 / 1024;
}

export function estimatedUploadSec(mode: RecordingMode, durationSec: number): number {
  const sizeMB = estimatedFileSizeMB(mode, durationSec);
  const rawSec = Math.ceil(sizeMB / UPLOAD_MBPS);
  return rawSec + (mode === "voice" ? 2 : 5);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecording(
  meetingId: string,
  localStream: MediaStream | null,
  emitFn?: (event: string, payload: unknown) => void,
  options?: UseRecordingOptions,
): UseRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMode, setRecordingMode] = useState<RecordingMode | null>(null);
  const [recordingDurationSec, setRecordingDurationSec] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [lastRecording, setLastRecording] = useState<RecordingEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  // ── Callback refs — assigned synchronously every render ───────────────────
  //
  // WHY NOT useEffect: useEffect runs after paint (async). The setInterval
  // callback closes over these refs and fires every second. If a parent
  // re-render happens between the tick and the effect, the ref is stale for
  // one tick. Synchronous assignment in the render body guarantees the ref
  // is always up-to-date before any effect or interval runs.
  //
  // WHY REFS AT ALL: storing callbacks in refs lets the interval closure
  // always call the latest version without being in the dependency array of
  // useCallback (which would re-create the interval on every parent render).
  const emitFnRef = useRef<typeof emitFn>(emitFn);
  const onApproachingLimitRef = useRef<(() => void) | undefined>(undefined);
  const onLimitExceededRef = useRef<(() => void) | undefined>(undefined);

  // Synchronous ref sync — no useEffect needed.
  emitFnRef.current = emitFn;
  onApproachingLimitRef.current = options?.onApproachingLimit;
  onLimitExceededRef.current = options?.onLimitExceeded;

  // Per-session state refs (reset on each startRecording call).
  const warnFiredRef = useRef(false);
  const limitExceededRef = useRef(false);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const broadcastRecordingState = useCallback((recording: boolean, mode: RecordingMode | null) => {
    emitFnRef.current?.("recording-state", { recording, mode });
  }, []);

  // ── Upload ────────────────────────────────────────────────────────────────
  const uploadToCloudinary = useCallback(
    async (blob: Blob, mode: RecordingMode, durationSec: number, mimeType: string) => {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      try {
        // Step 1: get signed upload credentials from backend.
        // The backend re-validates durationSec <= MAX_RECORDING_DURATION_SEC
        // so a tampered client cannot bypass the cap server-side.
        const sigRes = await apiClient.post(API_ENDPOINTS.RECORDING_SIGNATURE, {
          meetingId,
          mode,
          durationSec,
          fileType: mimeType || "video/webm",
        });

        const { signature, timestamp, cloudName, apiKey, publicId, resourceType, transformation } =
          sigRes.data.data;

        // Step 2: upload directly to Cloudinary with XHR for progress tracking.
        const formData = new FormData();
        formData.append("file", blob, `recording-${Date.now()}.webm`);
        formData.append("signature", signature);
        formData.append("timestamp", String(timestamp));
        formData.append("api_key", apiKey);
        formData.append("public_id", publicId);
        if (transformation) formData.append("transformation", transformation);

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`);

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              setUploadProgress(Math.round((e.loaded / e.total) * 85));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Cloudinary upload failed: ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.send(formData);
        });

        setUploadProgress(90);

        // Step 3: save metadata and trigger the email notification.
        const saveRes = await apiClient.post(API_ENDPOINTS.RECORDING_SAVE, {
          meetingId,
          publicId,
          mode,
          durationSec,
          fileSizeBytes: blob.size,
          mimeType,
        });

        setUploadProgress(100);
        setLastRecording(saveRes.data.data.recording);
      } catch (err: any) {
        if (err?.response?.data?.code === "RECORDING_LIMIT_EXCEEDED") {
          setError(
            `Recording exceeds the ${MAX_RECORDING_DURATION_MIN}-minute limit and could not be uploaded.`,
          );
        } else {
          setError(err?.response?.data?.message ?? err?.message ?? "Upload failed.");
        }
      } finally {
        setIsUploading(false);
      }
    },
    [meetingId],
  );

  // ── startRecording ────────────────────────────────────────────────────────
  const startRecording = useCallback(
    async (mode: RecordingMode) => {
      // Reset all session state.
      setError(null);
      setLastRecording(null);
      setUploadProgress(0);
      chunksRef.current = [];
      warnFiredRef.current = false;
      limitExceededRef.current = false;

      if (!localStream && mode === "voice") {
        setError("No microphone stream available.");
        return;
      }

      try {
        let captureStream: MediaStream;

        if (mode === "voice") {
          const audioTracks = localStream!.getAudioTracks();
          if (!audioTracks.length) {
            setError("No microphone track found. Make sure your mic is enabled.");
            return;
          }
          captureStream = new MediaStream(audioTracks);
        } else if (mode === "screen") {
          captureStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 30 } },
            audio: false,
          });
        } else {
          // screen_voice: screen video + existing mic audio tracks.
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 30 } },
            audio: false,
          });
          const audioTracks = localStream?.getAudioTracks() ?? [];
          captureStream = new MediaStream([...screenStream.getTracks(), ...audioTracks]);
        }

        // Pick the best supported container format.
        const mimeTypes =
          mode === "voice"
            ? ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"]
            : [
                "video/webm;codecs=vp9,opus",
                "video/webm;codecs=vp8,opus",
                "video/webm",
                "video/mp4",
              ];

        const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";

        const recorder = new MediaRecorder(captureStream, {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: mode === "voice" ? undefined : 2_500_000,
          audioBitsPerSecond: 128_000,
        });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          // Always clear the timer here — it may already be null if the hard
          // stop path cleared it first, but clearInterval(null) is a no-op.
          clearTimer();

          const durationSec = Math.round((Date.now() - startTimeRef.current) / 1000);
          const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
          chunksRef.current = [];

          // Release screen capture (turns off the browser recording indicator).
          captureStream.getTracks().forEach((t) => t.stop());

          setIsRecording(false);
          setRecordingMode(null);
          setRecordingDurationSec(0);
          broadcastRecordingState(false, null);

          // Upload the recording whether it stopped normally or hit the limit —
          // the captured content up to the cut-off point is valid.
          await uploadToCloudinary(blob, mode, durationSec, mimeType);
        };

        recorder.start(1000); // chunk every second
        mediaRecorderRef.current = recorder;
        startTimeRef.current = Date.now();

        setIsRecording(true);
        setRecordingMode(mode);
        setRecordingDurationSec(0);
        broadcastRecordingState(true, mode);

        // ── Duration-tracking interval ──────────────────────────────────────
        //
        // Three jobs per tick:
        //   1. Update the elapsed-time counter displayed in the UI.
        //   2. Fire the soft warning exactly once when 60 seconds remain
        //      (i.e. at the 4:00 mark for a 5-min cap).
        //   3. Force-stop the recorder at exactly 5:00 (300 s elapsed).
        //
        // Reading callbacks via refs (not closure captures) means the latest
        // parent handlers are always called even if the parent re-rendered
        // between ticks.
        timerRef.current = setInterval(() => {
          const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
          setRecordingDurationSec(elapsed);

          const remaining = MAX_RECORDING_DURATION_SEC - elapsed;

          // ── Soft warning (fires once, exactly at 60 s remaining) ──────────
          if (remaining <= RECORDING_WARNING_BEFORE_SEC && remaining > 0 && !warnFiredRef.current) {
            warnFiredRef.current = true;
            onApproachingLimitRef.current?.();
          }

          // ── Hard stop (fires once, at 0 s remaining) ──────────────────────
          if (elapsed >= MAX_RECORDING_DURATION_SEC) {
            // Clear the interval first so this branch never runs twice.
            clearTimer();
            limitExceededRef.current = true;

            // Fire the exceeded callback before stopping so the modal can
            // appear before the async upload chain begins.
            onLimitExceededRef.current?.();

            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop();
            }
          }
        }, 1000);
      } catch (err: any) {
        if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
          setError("Screen share or microphone permission was denied.");
        } else {
          setError(err?.message ?? "Failed to start recording.");
        }
      }
    },
    [localStream, broadcastRecordingState, uploadToCloudinary, clearTimer],
  );

  // ── stopRecording ─────────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return {
    isRecording,
    recordingMode,
    recordingDurationSec,
    startRecording,
    stopRecording,
    uploadProgress,
    isUploading,
    lastRecording,
    error,
  };
}
