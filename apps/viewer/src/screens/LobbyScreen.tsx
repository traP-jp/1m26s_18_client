import { useEffect, useState } from "react";
import { Button, Gauge, ParticipantCounter, Panel, ProgressBar, RoomJoinCard } from "ui";
import type { ProgressSegment } from "ui";
import { useServerTime } from "protocol";
import type { SongData } from "../api/songs";
import type { RoomInfo } from "../api/rooms";
import type { HostRoomState } from "../api/useHostRoom";
import {
  mockSong,
  mockChorusSections,
  mockParticipantCount,
  mockReadyRatio,
  mockRoomCode,
} from "../mockData";
import { buildControllerJoinUrl } from "../api/config";

export interface LobbyScreenProps {
  onNext: () => void;
  song?: SongData | null;
  room?: RoomInfo | null;
  hostRoom?: HostRoomState;
}

/** unix µs を「日時.ミリ秒」表示にする(デバッグ用) */
function formatServerTimeUs(serverTimeUs: number): string {
  const ms = Math.floor(serverTimeUs / 1000);
  return `${new Date(ms).toLocaleString("ja-JP", { hour12: false })}.${String(ms % 1000).padStart(3, "0")}`;
}

export function LobbyScreen({ onNext, song, room, hostRoom }: LobbyScreenProps) {
  const status = hostRoom?.status ?? "idle";
  const roomCode = room?.roomId ?? mockRoomCode;
  const joinUrl = buildControllerJoinUrl(roomCode);
  const serverTime = useServerTime();
  const serverNowUs = serverTime.nowUs();
  // デバッグ表示用: 補正後の時刻が進んでいることを確認できるよう、開発時のみ定期的に再レンダーする
  const [, setDebugTick] = useState(0);
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }
    const timer = window.setInterval(() => setDebugTick((tick) => tick + 1), 50);
    return () => window.clearInterval(timer);
  }, []);
  const title = song?.type === "complete" ? song.title : mockSong.title;
  const artist = song?.type === "complete" ? song.artist : mockSong.artist;
  const chorusSections: ProgressSegment[] =
    song && song.durationMs > 0
      ? song.segments
        .filter((seg) => seg.isChorus)
        .map((seg) => ({
          startPct: (seg.startsAtMs / song.durationMs) * 100,
          endPct: (seg.endsAtMs / song.durationMs) * 100,
          type: "chorus" as const,
        }))
      : mockChorusSections;

  return (
    <div className="viewer-lobby">
      <header className="viewer-lobby__header">
        <div className="viewer-song-card">
          <div className="viewer-song-card__thumb" aria-hidden="true" />
          <div className="viewer-song-card__meta">
            <span className="viewer-song-card__title">{title}</span>
            <span className="viewer-song-card__artist">{artist}</span>
          </div>
        </div>
      </header>

      <div className="viewer-lobby__body">
        <Panel className="viewer-lobby__hero" glow>
          <span className="viewer-lobby__hero-label">参加はこちらから</span>
          <RoomJoinCard roomCode={roomCode} joinUrl={joinUrl} />
        </Panel>

        <div className="viewer-lobby__stats">
          <Panel className="viewer-lobby__panel viewer-lobby__panel--count">
            <ParticipantCounter count={mockParticipantCount} />
          </Panel>

          <Panel className="viewer-lobby__panel">
            <h2 className="viewer-panel-title">全体ゲージ(準備完了度)</h2>
            <Gauge valuePct={mockReadyRatio} label="キャリブレーション完了率" />
          </Panel>

          <Panel className="viewer-lobby__panel">
            <h2 className="viewer-panel-title">曲の進行プレビュー</h2>
            <ProgressBar segments={chorusSections} progressPct={0} />
            <p className="viewer-hint">オレンジ区間がサビです</p>
          </Panel>
        </div>
      </div>

      <div className="viewer-lobby__footer">
        <Button onClick={onNext} disabled={room != null && status !== "connected"}>
          ライブ開始
        </Button>
      </div>

      {import.meta.env.DEV && (
        <Panel className="viewer-lobby__panel">
          <h2 className="viewer-panel-title">時刻同期(デバッグ)</h2>
          <p className="viewer-hint">
            状態: {serverTime.synced ? "同期済み" : "同期中…"}
            {serverTime.offsetUs !== null && ` / オフセット: ${(serverTime.offsetUs / 1000).toFixed(1)}ms`}
            {serverTime.rttMs !== null && ` / RTT: ${serverTime.rttMs.toFixed(1)}ms`}
          </p>
          <p className="viewer-hint">
            サーバー時刻: {serverNowUs === null ? "—" : formatServerTimeUs(serverNowUs)}
          </p>
          <Button variant="secondary" onClick={() => serverTime.resync()}>
            再同期
          </Button>
        </Panel>
      )}
    </div>
  );
}
