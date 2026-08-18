import type { PenlightItem, ProgressSegment } from "ui";

export const PENLIGHT_COLORS = [
  "#00e5ff",
  "#fff01f",
  "#ff8c00",
  "#ff00d9",
  "#2979ff",
  "#ff1744",
  "#ddeae3",
];

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
export const mockRoomCode = "ABC123";
export const mockJoinUrl = "https://live.example.com/join/ABC123";

export const mockLyricLine = "ひとりぼっちでも君とリスタート！";

export const mockPenlights: PenlightItem[] = Array.from({ length: 96 }, (_, i) => ({
  id: `u${i}`,
  color: PENLIGHT_COLORS[i % PENLIGHT_COLORS.length],
  intensity: 0.3 + ((i * 7) % 10) * 0.07,
}));
