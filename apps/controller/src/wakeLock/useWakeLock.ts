import { useEffect, useSyncExternalStore } from "react";
import { wakeLock, type WakeLockSnapshot } from "./wakeLock";

export type { WakeLockFallback, WakeLockPermission, WakeLockSnapshot, WakeLockStatus } from "./wakeLock";
export { isWakeLockSupported } from "./wakeLock";

/**
 * マウントしている間、画面の自動ロック(スリープ)を抑止したいと宣言する。
 * 実際に動き出すのは利用者が requestWakeLockPermission() で許可してから。
 * 複数の画面・コンポーネントから同時に呼んでも 1 つのロックを共有し、全員がアンマウントしたら解放する。
 * 現在の状態(active / denied など)を返すので、必要なら UI に出せる。
 */
export function useWakeLock(enabled = true): WakeLockSnapshot {
  const snapshot = useSyncExternalStore(wakeLock.subscribe, wakeLock.getSnapshot, wakeLock.getSnapshot);

  useEffect(() => {
    if (!enabled) return;
    return wakeLock.retain();
  }, [enabled]);

  return snapshot;
}

/** 「許可する」のタップハンドラから直接呼ぶこと(iOS の動画再生開始に必要) */
export function requestWakeLockPermission() {
  return wakeLock.requestPermission();
}

/** タップハンドラなどから明示的に取り直したい時に使う */
export function refreshWakeLock() {
  return wakeLock.refresh();
}
