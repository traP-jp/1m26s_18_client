import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motionSensor, type MotionSnapshot } from "./motionSensor";
import type { ShakeEvent } from "./shakeDetector";

export { SHAKE_THRESHOLD_PCT } from "./shakeDetector";
export type { MotionSnapshot, MotionStatus } from "./motionSensor";
export type { MotionSample, ShakeEvent } from "./shakeDetector";

/**
 * センサーの許可状態。アプリ内どこから呼んでも同じシングルトンを参照する。
 * 許可 API が不要な環境(Android/PC)では初回マウント時に自動でリスニングを開始する。
 */
export function useMotionStatus(): MotionSnapshot {
  const snapshot = useSyncExternalStore(
    motionSensor.subscribeStatus,
    motionSensor.getSnapshot,
    motionSensor.getSnapshot,
  );
  useEffect(() => {
    motionSensor.autoStart();
  }, []);
  return snapshot;
}

/**
 * 許可ダイアログを開く。iOS では必ずタップ等のイベントハンドラから直接呼ぶこと。
 */
export function requestMotionPermission() {
  return motionSensor.requestPermission();
}

/**
 * 現在の振り強度 (0–100)。60Hz 前後で来るサンプルを requestAnimationFrame 単位にまとめて再描画する。
 * センサーが動いていない間は 0 のまま。
 */
export function useMotionIntensity(): number {
  const [intensity, setIntensity] = useState(0);
  const latest = useRef(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = motionSensor.subscribeSample((sample) => {
      latest.current = sample.intensity;
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        setIntensity(latest.current);
      });
    });
    return () => {
      unsubscribe();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, []);

  return intensity;
}

/**
 * 1 回「振った」と判定されるごとに handler を呼ぶ。handler は毎レンダー変わっても再購読しない。
 */
export function useShake(handler: (shake: ShakeEvent) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => motionSensor.subscribeShake((shake) => handlerRef.current(shake)), []);
}
