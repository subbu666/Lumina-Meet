/**
 * useRecording — Lumina Meet
 *
 * FIXED: socketRef is now created internally — no longer passed as a prop.
 * The hook accepts an optional `emitFn` callback instead, which meeting.$id.tsx
 * wires to webrtc.socketRef.current?.emit. This removes the ref-timing issue
 * entirely: the callback is always up-to-date via useCallback in the parent.
 *
 * Recording modes:
 *  "screen_voice" — screen share + microphone
 *  "voice"        — microphone only (audio/webm)
 *  "screen"       — screen video only (no audio)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { API_ENDPOINTS } from "@/api/endpoints";

// ─── Types ─────────────────────────────────────────────────────────────────

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

// ─── Upload time estimator (exported so RecordingLinkModal can use it) ──────

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

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * @param meetingId   - current meeting ID
 * @param localStream - the local MediaStream from useWebRTC
 * @param emitFn      - optional function to emit socket events.
 *                      Pass: (event, payload) => webrtc.socketRef.current?.emit(event, payload)
 *                      This avoids passing the raw ref and eliminates the
 *                      "cannot read properties of undefined (reading 'current')" crash.
 */
export function useRecording(
  meetingId: string,
  localStream: MediaStream | null,
  emitFn?: (event: string, payload: unknown) => void,
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
  // Keep emitFn in a ref so recorder.onstop (a closure) always sees the latest version
  const emitFnRef = useRef(emitFn);
  useEffect(() => {
    emitFnRef.current = emitFn;
  }, [emitFn]);

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
    // Safe: emitFnRef.current is a plain function, never a ref object
    emitFnRef.current?.("recording-state", { recording, mode });
  }, []);

  const uploadToCloudinary = useCallback(
    async (blob: Blob, mode: RecordingMode, durationSec: number, mimeType: string) => {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      try {
        // Step 1: get Cloudinary signature from backend
        const sigRes = await apiClient.post(API_ENDPOINTS.RECORDING_SIGNATURE, {
          meetingId,
          mode,
          durationSec,
          fileType: mimeType || "video/webm",
        });

        const { signature, timestamp, cloudName, apiKey, publicId, resourceType, transformation } =
          sigRes.data.data;

        // Step 2: upload directly to Cloudinary with XHR for progress tracking
        // NOTE: Do NOT append `folder` — publicId already encodes the full path
        // (lumina-meet/{meetingId}/{mode}-{ts}). Sending folder separately would
        // cause Cloudinary to double-nest the path and break the delivery URL.
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
              // Cap at 85 — remaining 15% is backend save + email
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
        setError(err?.response?.data?.message ?? err?.message ?? "Upload failed.");
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

      if (!localStream && mode === "voice") {
        setError("No microphone stream available.");
        return;
      }
      if (!localStream && mode !== "voice") {
        // Screen modes open their own capture stream — localStream only needed for audio tracks
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

          await uploadToCloudinary(blob, mode, durationSec, mimeType);
        };

        recorder.start(1000); // chunk every second for smooth progress
        mediaRecorderRef.current = recorder;
        startTimeRef.current = Date.now();

        setIsRecording(true);
        setRecordingMode(mode);
        setRecordingDurationSec(0);
        broadcastRecordingState(true, mode);

        timerRef.current = setInterval(() => {
          setRecordingDurationSec(Math.round((Date.now() - startTimeRef.current) / 1000));
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
