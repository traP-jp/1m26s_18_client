import { useEffect, useState } from "react";
import type { RoomConnection } from "protocol";
import { DEFAULT_PENLIGHT_COLOR_ID } from "ui";

export interface ParticipantPenlight {
  participantId: string;
  colorId: number;
  /** 直近の ParticipantShake 受信時刻 (performance.now() 基準)。未受信なら null */
  lastShakeAtMs: number | null;
  /** ParticipantShake の通算受信回数。振りアニメの再発火用キー */
  shakeSeq: number;
}

/**
 * host 用: 参加者ごとのペンライト状態 (色 + Shake時刻) を購読する。
 * - participantJoined: 既定色で追加
 * - participantColorChange: 色を更新 (未知の参加者からの通知でも upsert する)
 * - participantShake: Shake時刻を更新 (datagram 受信)
 * - participantLeft: 削除
 */
export function useParticipantPenlights(
  connection: RoomConnection | null | undefined,
): ReadonlyMap<string, ParticipantPenlight> {
  const [penlights, setPenlights] = useState<ReadonlyMap<string, ParticipantPenlight>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!connection) {
      setPenlights(new Map());
      return;
    }
    return connection.subscribeServerMessage((message) => {
      switch (message.type) {
        case "participantJoined": {
          setPenlights((prev) => {
            if (prev.has(message.participantId)) {
              return prev;
            }
            const next = new Map(prev);
            next.set(message.participantId, {
              participantId: message.participantId,
              colorId: DEFAULT_PENLIGHT_COLOR_ID,
              lastShakeAtMs: null,
              shakeSeq: 0,
            });
            return next;
          });
          break;
        }
        case "participantColorChange": {
          setPenlights((prev) => {
            const next = new Map(prev);
            const existing = next.get(message.participantId);
            next.set(message.participantId, {
              participantId: message.participantId,
              colorId: message.colorId,
              lastShakeAtMs: existing?.lastShakeAtMs ?? null,
              shakeSeq: existing?.shakeSeq ?? 0,
            });
            return next;
          });
          break;
        }
        case "participantShake": {
          setPenlights((prev) => {
            const next = new Map(prev);
            const existing = next.get(message.participantId);
            next.set(message.participantId, {
              participantId: message.participantId,
              colorId: existing?.colorId ?? DEFAULT_PENLIGHT_COLOR_ID,
              lastShakeAtMs: performance.now(),
              shakeSeq: (existing?.shakeSeq ?? 0) + 1,
            });
            return next;
          });
          break;
        }
        case "participantLeft": {
          setPenlights((prev) => {
            if (!prev.has(message.participantId)) {
              return prev;
            }
            const next = new Map(prev);
            next.delete(message.participantId);
            return next;
          });
          break;
        }
        default:
          break;
      }
    });
  }, [connection]);

  return penlights;
}
