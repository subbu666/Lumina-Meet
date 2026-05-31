/**
 * useRecording — Lumina Meet
 *
 * ADDED in this version:
 *  • MAX_RECORDING_DURATION_SEC (15 min) hard cap — the hook auto-stops
 *    the MediaRecorder when the limit is hit and fires onLimitExceeded().
 *  • RECORDING_WARNING_BEFORE_SEC (60 s) soft warning — fires
 *    onApproachingLimit() at the 14:00 mark so the UI can show a banner.
 *  • Both callbacks are optional; the hook is fully backward-compatible.
 *
 * Recording modes:
 *  "screen_voice" — screen share + microphone
 *  "voice"        — microphone only (audio/webm)
 *  "screen"       — screen video only (no audio)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { API_ENDPOINTS } from "@/api/endpoints";

// ─── Shared limit constants (mirrors backend constants/index.js) ─────────────
// Defined here so the frontend never needs to fetch them from the API.
// If you change the backend constant, update this too.
export const MAX_RECORDING_DURATION_SEC = 5 * 60; // 900 s = 15 min
export const MAX_RECORDING_DURATION_MIN = 5;
export const RECORDING_WARNING_BEFORE_SEC = 60; // warn at 4:00 remaining

// ─── Types ───────────────────────────────────────────────────────────────────

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
  /** Called once when the recording crosses the limit and is force-stopped. */
  onLimitExceeded?: () => void;
  /**
   * Called once when RECORDING_WARNING_BEFORE_SEC seconds remain.
   * Useful for showing a "1 minute left" banner before the hard stop.
   */
  onApproachingLimit?: () => void;
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

// ─── Upload time estimator (exported so RecordingLinkModal can use it) ───────

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

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * @param meetingId   - current meeting ID
 * @param localStream - the local MediaStream from useWebRTC
 * @param emitFn      - optional function to emit socket events.
 *                      Pass: (event, payload) => webrtc.socketRef.current?.emit(event, payload)
 * @param options     - optional callbacks: onLimitExceeded, onApproachingLimit
 */
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

  // Keep emitFn + callbacks in refs so closures always see the latest versions
  const emitFnRef = useRef(emitFn);
  const onLimitExceededRef = useRef(options?.onLimitExceeded);
  const onApproachingLimitRef = useRef(options?.onApproachingLimit);
  // Track whether we've already fired the approaching-limit warning this session
  const warnFiredRef = useRef(false);
  // Track whether limit was exceeded (used in onstop to suppress normal upload flow)
  const limitExceededRef = useRef(false);

  useEffect(() => {
    emitFnRef.current = emitFn;
  }, [emitFn]);

  useEffect(() => {
    onLimitExceededRef.current = options?.onLimitExceeded;
    onApproachingLimitRef.current = options?.onApproachingLimit;
  }, [options?.onLimitExceeded, options?.onApproachingLimit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const broadcastRecordingState = useCallback((recording: boolean, mode: RecordingMode | null) => {
    emitFnRef.current?.("recording-state", { recording, mode });
  }, []);

  const uploadToCloudinary = useCallback(
    async (blob: Blob, mode: RecordingMode, durationSec: number, mimeType: string) => {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      try {
        // Step 1: get Cloudinary signature from backend
        // The backend will reject if durationSec > MAX_RECORDING_DURATION_SEC
        const sigRes = await apiClient.post(API_ENDPOINTS.RECORDING_SIGNATURE, {
          meetingId,
          mode,
          durationSec,
          fileType: mimeType || "video/webm",
        });

        const { signature, timestamp, cloudName, apiKey, publicId, resourceType, transformation } =
          sigRes.data.data;

        // Step 2: upload directly to Cloudinary with XHR for progress tracking
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

        // Step 3: tell backend to save metadata and send the email
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
        // Surface the recording-limit error with a friendly message if the
        // backend also rejected it (e.g. clock skew between client and server)
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

  const startRecording = useCallback(
    async (mode: RecordingMode) => {
      setError(null);
      setLastRecording(null);
      chunksRef.current = [];
      limitExceededRef.current = false;
      warnFiredRef.current = false;

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
          // screen_voice: screen video + existing mic audio
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 30 } },
            audio: false,
          });
          const audioTracks = localStream?.getAudioTracks() ?? [];
          captureStream = new MediaStream([...screenStream.getTracks(), ...audioTracks]);
        }

        // Pick the best supported container format
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
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          const durationSec = Math.round((Date.now() - startTimeRef.current) / 1000);
          const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
          chunksRef.current = [];

          // Release the screen capture grab (camera LED off etc.)
          captureStream.getTracks().forEach((t) => t.stop());

          setIsRecording(false);
          setRecordingMode(null);
          setRecordingDurationSec(0);
          broadcastRecordingState(false, null);

          // If the limit was exceeded we still upload — the recording up to the
          // cut-off point is perfectly valid. The onLimitExceeded callback has
          // already fired before onstop to show the modal.
          await uploadToCloudinary(blob, mode, durationSec, mimeType);
        };

        recorder.start(1000); // chunk every second for smooth progress
        mediaRecorderRef.current = recorder;
        startTimeRef.current = Date.now();

        setIsRecording(true);
        setRecordingMode(mode);
        setRecordingDurationSec(0);
        broadcastRecordingState(true, mode);

        // ── Duration-tracking interval ────────────────────────────────────────
        // This interval has two jobs:
        //   1. Update the live elapsed-time counter in the UI (every second).
        //   2. Enforce the hard 15-minute cap by stopping the MediaRecorder
        //      when MAX_RECORDING_DURATION_SEC is reached.
        // It also fires a one-time soft warning RECORDING_WARNING_BEFORE_SEC
        // seconds before the cap (i.e. at the 14:00 mark).
        timerRef.current = setInterval(() => {
          const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
          setRecordingDurationSec(elapsed);

          // ── Soft warning (fires once at 14:00) ─────────────────────────────
          const remaining = MAX_RECORDING_DURATION_SEC - elapsed;
          if (remaining <= RECORDING_WARNING_BEFORE_SEC && remaining > 0 && !warnFiredRef.current) {
            warnFiredRef.current = true;
            onApproachingLimitRef.current?.();
          }

          // ── Hard stop at 15:00 ─────────────────────────────────────────────
          if (elapsed >= MAX_RECORDING_DURATION_SEC) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            limitExceededRef.current = true;

            // Fire the exceeded callback first so the modal appears before
            // the recorder's onstop async chain begins.
            onLimitExceededRef.current?.();

            // Stop the recorder — this will trigger onstop above which
            // handles cleanup and upload.
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
    [localStream, broadcastRecordingState, uploadToCloudinary],
  );

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
