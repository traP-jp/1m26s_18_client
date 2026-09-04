import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useServerTime } from "protocol";
import type { RoomConnection } from "protocol";

/**
 * ライブ開始時刻の状態。`LiveClockProvider` の配下で `useLiveClock()` から取得できる。
 *
 * `liveStarted` ブロードキャストの受信時刻ではなく、ペイロードの `startTime`
 * (サーバー時刻, unix µs) を保持し、経過時間は呼ぶたびに現在時刻から換算する。
 */
export interface LiveClockState {
  /** `liveStarted` を受け取ったか */
  started: boolean;
  /** ライブ開始時刻 (サーバー時刻, unix µs)。未受信なら null */
  liveStartTimeUs: number | null;
  /** ライブ開始時刻をローカル時刻 (performance.now() 基準, ms) に換算したもの。未受信・時刻同期前は null */
  liveOriginMs: number | null;
  /** ライブ開始からの経過時間 (ms)。未受信・時刻同期前は null */
  getElapsedMs: (nowMs?: number) => number | null;
}

const LiveClockContext = createContext<LiveClockState | null>(null);

export interface LiveClockProviderProps {
  /** WebTransport 接続。`liveStarted` ブロードキャストの購読に使う */
  connection: RoomConnection | null;
  children: ReactNode;
}

/**
 * `connection` からの `liveStarted` を購読し、開始時刻を配下の
 * `useLiveClock()` に提供する。`ServerTimeProvider` の配下で使うこと。
 *
 * raw の `startTime` (サーバー時刻) を保持し、`liveOriginMs` / `getElapsedMs()` は
 * その時点の `toLocalMs()` で遅延換算するため、同期前に受信しても同期完了後に
 * 自動で有効になる。再 `liveStarted` は最新で上書きし、接続切替時はリセットする。
 */
export function LiveClockProvider({ connection, children }: LiveClockProviderProps) {
  const [liveStartTimeUs, setLiveStartTimeUs] = useState<number | null>(null);
  const serverTime = useServerTime();

  useEffect(() => {
    if (!connection) {
      setLiveStartTimeUs(null);
      return;
    }
    setLiveStartTimeUs(null);
    const unsubscribe = connection.subscribeServerMessage((message) => {
      if (message.type === "liveStarted") {
        setLiveStartTimeUs(message.startTime);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [connection]);

  const liveOriginMs =
    liveStartTimeUs !== null ? serverTime.toLocalMs(liveStartTimeUs) : null;

  const getElapsedMs = useCallback(
    (nowMs: number = performance.now()): number | null => {
      if (liveStartTimeUs === null) {
        return null;
      }
      const originMs = serverTime.toLocalMs(liveStartTimeUs);
      if (originMs === null) {
        return null;
      }
      return nowMs - originMs;
    },
    [liveStartTimeUs, serverTime],
  );

  const value = useMemo<LiveClockState>(
    () => ({
      started: liveStartTimeUs !== null,
      liveStartTimeUs,
      liveOriginMs,
      getElapsedMs,
    }),
    [liveStartTimeUs, liveOriginMs, getElapsedMs],
  );

  return <LiveClockContext.Provider value={value}>{children}</LiveClockContext.Provider>;
}

/** ライブ開始時刻・経過時間を参照する。`LiveClockProvider` の配下でのみ呼べる */
export function useLiveClock(): LiveClockState {
  const state = useContext(LiveClockContext);
  if (!state) {
    throw new Error("useLiveClock() は LiveClockProvider の配下で呼んでください");
  }
  return state;
}
