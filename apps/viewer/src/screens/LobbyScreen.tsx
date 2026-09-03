import { Button, Gauge, ParticipantCounter, Panel, ProgressBar, RoomJoinCard } from "ui";
import type { ProgressSegment } from "ui";
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
import { CONTROLLER_BASE_URL } from "../api/config";

export interface LobbyScreenProps {
  onNext: () => void;
  song?: SongData | null;
  room?: RoomInfo | null;
  hostRoom?: HostRoomState;
}

export function LobbyScreen({ onNext, song, room, hostRoom }: LobbyScreenProps) {
  const status = hostRoom?.status ?? "idle";
  const roomCode = room?.roomId ?? mockRoomCode;
  const joinUrl = `${CONTROLLER_BASE_URL}/room/${roomCode}`;
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
    </div>
  );
}
