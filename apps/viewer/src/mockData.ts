import { PENLIGHT_PALETTE } from "ui";
import type { PenlightItem, ProgressSegment } from "ui";

export const mockSong = {
  title: "君とリスタート！",
  artist: "masataro",
  thumbnailUrl: "",
  durationMs: 240_000,
};

export const mockChorusSections: ProgressSegment[] = [
  { startPct: 12, endPct: 25, type: "chorus" },
  { startPct: 62, endPct: 75, type: "chorus" },
];

export const mockPlaybackProgressPct = 34;

export const mockParticipantCount = 248;
export const mockReadyRatio = 62; // %
export const mockHeatLevel = 71; // %
export const mockRoomCode = "1234";

export const mockLyricLine = "";

export const mockPenlights: PenlightItem[] = Array.from({ length: 96 }, (_, i) => ({
  id: `u${i}`,
  color: PENLIGHT_PALETTE[i % PENLIGHT_PALETTE.length],
  intensity: 0.3 + ((i * 7) % 10) * 0.07,
}));
