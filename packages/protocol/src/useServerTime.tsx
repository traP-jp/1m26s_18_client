import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { synchronizeTime } from "./timeSync";
import type { ServerClock } from "./timeSync";
import type { RoomConnection } from "./connection";

/**
 * 補正済みサーバー時刻の状態。`ServerTimeProvider` の配下で
 * `useServerTime()` から取得できる。
 *
 * `offsetUs` などのスナップショットは(再)同期のたびに更新され、
 * `nowUs()`/`toLocalMs()`/`toServerUs()` は呼ぶたびに現在時刻から換算する。
 */
export interface ServerTimeState {
  /** 時刻同期が完了しているか */
  synced: boolean;
  /** サーバー時計とクライアント時計の差 (サーバー − クライアント, µs)。未補正なら null */
  offsetUs: number | null;
  /** 同期に使ったサンプルの往復時間 (ms)。未補正なら null */
  rttMs: number | null;
  /** 現在の推定サーバー時刻 (unix µs)。未補正なら null */
  nowUs: () => number | null;
  /** サーバー時刻 (unix µs) をローカル時刻 (performance.now() 基準, ms) に変換する。未補正なら null */
  toLocalMs: (serverTimeUs: number) => number | null;
  /** ローカル時刻 (performance.now() 基準, ms) をサーバー時刻 (unix µs) に変換する。未補正なら null */
  toServerUs: (localMs: number) => number | null;
  /** 時刻同期を手動でやり直す(補正タイミングの追加用) */
  resync: () => void;
}

const ServerTimeContext = createContext<ServerTimeState | null>(null);

export interface ServerTimeProviderProps {
  /** WebTransport 接続。利用可能になったら自動で時刻同期する */
  connection: RoomConnection | null;
  children: ReactNode;
}

/**
 * `connection` が利用可能になったら TimeSyncRequest で時刻を補正し、
 * 補正済み時刻を配下の `useServerTime()` に提供する。
 * 補正タイミングを増やす・変更する場合は `resync()` を呼ぶ。
 */
export function ServerTimeProvider({ connection, children }: ServerTimeProviderProps) {
  const [clock, setClock] = useState<ServerClock | null>(null);
  const [syncToken, setSyncToken] = useState(0);

  useEffect(() => {
    if (!connection) {
      setClock(null);
      return;
    }
    let cancelled = false;
    void synchronizeTime(connection)
      .then((synced) => {
        if (!cancelled) {
          setClock(synced);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.warn("時刻同期に失敗しました", error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [connection, syncToken]);

  const resync = useCallback(() => {
    setSyncToken((token) => token + 1);
  }, []);

  const value = useMemo<ServerTimeState>(() => {
    if (!clock) {
      return {
        synced: false,
        offsetUs: null,
        rttMs: null,
        nowUs: () => null,
        toLocalMs: () => null,
        toServerUs: () => null,
        resync,
      };
    }
    return {
      synced: true,
      offsetUs: clock.offsetUs,
      rttMs: clock.rttMs,
      nowUs: () => clock.nowUs(),
      toLocalMs: (serverTimeUs: number) => clock.serverTimeToLocalMs(serverTimeUs),
      toServerUs: (localMs: number) => clock.localMsToServerTime(localMs),
      resync,
    };
  }, [clock, resync]);

  return <ServerTimeContext.Provider value={value}>{children}</ServerTimeContext.Provider>;
}

/** 補正後の時刻を取得する。`ServerTimeProvider` の配下でのみ呼べる */
export function useServerTime(): ServerTimeState {
  const state = useContext(ServerTimeContext);
  if (!state) {
    throw new Error("useServerTime() は ServerTimeProvider の配下で呼んでください");
  }
  return state;
}
