import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { MEDIAPIPE_WASM_URL, POSE_MODEL_URL } from "./config";
import type { PoseFrame } from "./landmarks";

export type PoseTrackerStatus = "idle" | "starting" | "running" | "error";

export interface UsePoseLandmarkerResult {
  status: PoseTrackerStatus;
  error: string | null;
  /** 最新のワールドランドマーク。人物未検出時は null。毎フレーム更新されるが再レンダーは起こさない。 */
  frameRef: RefObject<PoseFrame | null>;
  /**
   * 最新の正規化画像ランドマーク(x/y は 0..1 の画像座標)。人物未検出時は null。
   * ワールドランドマークは腰中心が原点で画面内の立ち位置を持たないため、
   * 「カメラのどこに写っているか」はこちらから取る。
   */
  imageFrameRef: RefObject<PoseFrame | null>;
  /** プレビュー表示したい場合に <video> へ渡す(省略時は非表示の video を内部生成) */
  videoRef: RefObject<HTMLVideoElement | null>;
}

async function createLandmarker(): Promise<PoseLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  const baseOptions = { modelAssetPath: POSE_MODEL_URL };
  try {
    return await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { ...baseOptions, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  } catch (err) {
    console.warn("PoseLandmarker GPU delegate failed; falling back to CPU", err);
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { ...baseOptions, delegate: "CPU" },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }
}

/**
 * Web カメラ + MediaPipe Pose Landmarker で姿勢推定を回し、最新フレームを ref で返す。
 * `enabled` を false にするとカメラとモデルを解放する。
 */
export function usePoseLandmarker(enabled: boolean): UsePoseLandmarkerResult {
  const frameRef = useRef<PoseFrame | null>(null);
  const imageFrameRef = useRef<PoseFrame | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<PoseTrackerStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      frameRef.current = null;
      imageFrameRef.current = null;
      setStatus("idle");
      setError(null);
      return;
    }

    let cancelled = false;
    let landmarker: PoseLandmarker | null = null;
    let stream: MediaStream | null = null;
    let rafId = 0;
    const video = videoRef.current ?? document.createElement("video");
    video.muted = true;
    video.playsInline = true;

    setStatus("starting");
    setError(null);

    (async () => {
      const [lm, mediaStream] = await Promise.all([
        createLandmarker(),
        navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
          audio: false,
        }),
      ]);
      if (cancelled) {
        lm.close();
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }
      landmarker = lm;
      stream = mediaStream;
      video.srcObject = mediaStream;
      await video.play();
      if (cancelled) return;
      setStatus("running");

      let lastVideoTime = -1;
      const loop = () => {
        if (cancelled) return;
        rafId = requestAnimationFrame(loop);
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
        lastVideoTime = video.currentTime;
        const result = lm.detectForVideo(video, performance.now());
        frameRef.current = result.worldLandmarks[0] ?? null;
        imageFrameRef.current = result.landmarks[0] ?? null;
      };
      loop();
    })().catch((err: unknown) => {
      console.error("Failed to start pose tracking", err);
      if (cancelled) return;
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      landmarker?.close();
      stream?.getTracks().forEach((t) => t.stop());
      video.pause();
      video.srcObject = null;
      frameRef.current = null;
      imageFrameRef.current = null;
    };
  }, [enabled]);

  return { status, error, frameRef, imageFrameRef, videoRef };
}
