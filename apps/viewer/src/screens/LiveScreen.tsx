import { useEffect, useState } from "react";
import { Button, Gauge, ParticipantCounter, PenlightGrid, ProgressBar, ReactionOverlay } from "ui";
import type { PenlightWaveMode, ReactionItem } from "ui";
import { StagePlaceholder } from "../components/StagePlaceholder";
import { BackScreen } from "../components/BackScreen";
import { MikuModel3D } from "../components/MikuModel3D";
import { stampImages } from "../stamps";
import type { SongData } from "../api/songs";
import {
  mockSong,
  mockChorusSections,
  mockPlaybackProgressPct,
  mockHeatLevel,
  mockParticipantCount,
  mockPenlights,
  mockLyricLine,
} from "../mockData";

let reactionSeq = 0;

export interface LiveScreenProps {
  onSongEnd: () => void;
  song?: SongData | null;
  bpm?: number | null;
}

const WAVE_MODE_LABELS: Record<PenlightWaveMode, string> = {
  idle: "静止",
  fourFloor: "四つ打ち",
  buildup: "溜めハイ",
};

export function LiveScreen({ onSongEnd, song, bpm }: LiveScreenProps) {
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const [waveMode, setWaveMode] = useState<PenlightWaveMode>("idle");

  const title = song?.type === "complete" ? song.title : mockSong.title;
  const artist = song?.type === "complete" ? song.artist : mockSong.artist;

  useEffect(() => {
    if (stampImages.length === 0) return;
    const timer = window.setInterval(() => {
      const kind: ReactionItem["kind"] = Math.random() > 0.5 ? "stamp" : "balloon";
      reactionSeq += 1;
      setReactions((prev) => [
        ...prev,
        {
          id: `r${reactionSeq}`,
          kind,
          imageSrc: stampImages[Math.floor(Math.random() * stampImages.length)],
          leftPct: 10 + Math.random() * 80,
        },
      ]);
    }, 1800);
    return () => window.clearInterval(timer);
  }, []);

  const removeReaction = (id: string) => {
    setReactions((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="viewer-live">
      <div className="viewer-live__stage-area">
        <StagePlaceholder />
        <BackScreen line={mockLyricLine} />
        <MikuModel3D bpm={bpm} />

        <header className="viewer-live__header">
          <div className="viewer-song-card viewer-song-card--compact">
            <div className="viewer-song-card__thumb" aria-hidden="true" />
            <div className="viewer-song-card__meta">
              <span className="viewer-song-card__title">{title}</span>
              <span className="viewer-song-card__artist">{artist}</span>
            </div>
          </div>

          <div className="viewer-live__wave-demo">
            {(Object.keys(WAVE_MODE_LABELS) as PenlightWaveMode[]).map((mode) => (
              <Button
                key={mode}
                variant={waveMode === mode ? "primary" : "ghost"}
                onClick={() => setWaveMode(mode)}
              >
                {WAVE_MODE_LABELS[mode]}
              </Button>
            ))}
          </div>
        </header>

        <div className="viewer-live__audience">
          <PenlightGrid lights={mockPenlights} mode={waveMode} />
        </div>
        <ReactionOverlay items={reactions} onItemDone={removeReaction} />
      </div>

      <div className="viewer-live__hud">
        <div className="viewer-live__hud-item">
          <ParticipantCounter count={mockParticipantCount} label="視聴人数" />
        </div>
        <div className="viewer-live__hud-item viewer-live__hud-item--grow">
          <Gauge valuePct={mockHeatLevel} label="シンクロ度" />
        </div>
        <Button variant="ghost" onClick={onSongEnd}>
          ライブ終了
        </Button>
      </div>

      <div className="viewer-live__progress">
        <ProgressBar segments={mockChorusSections} progressPct={mockPlaybackProgressPct} />
      </div>
    </div>
  );
}
