import { Button, Gauge, ParticipantCounter, Panel, ProgressBar, RoomJoinCard } from "ui";
import {
  mockSong,
  mockChorusSections,
  mockParticipantCount,
  mockReadyRatio,
  mockRoomCode,
  mockJoinUrl,
} from "../mockData";

export interface LobbyScreenProps {
  onNext: () => void;
}

export function LobbyScreen({ onNext }: LobbyScreenProps) {
  return (
    <div className="viewer-lobby">
      <header className="viewer-lobby__header">
        <div className="viewer-song-card">
          <div className="viewer-song-card__thumb" aria-hidden="true" />
          <div className="viewer-song-card__meta">
            <span className="viewer-song-card__title">{mockSong.title}</span>
            <span className="viewer-song-card__artist">{mockSong.artist}</span>
          </div>
        </div>
      </header>

      <div className="viewer-lobby__body">
        <Panel className="viewer-lobby__hero" glow>
          <span className="viewer-lobby__hero-label">参加はこちらから</span>
          <RoomJoinCard roomCode={mockRoomCode} joinUrl={mockJoinUrl} />
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
            <ProgressBar segments={mockChorusSections} progressPct={0} />
            <p className="viewer-hint">オレンジ区間がサビです</p>
          </Panel>
        </div>
      </div>

      <div className="viewer-lobby__footer">
        <Button onClick={onNext}>ライブ開始</Button>
      </div>
    </div>
  );
}
