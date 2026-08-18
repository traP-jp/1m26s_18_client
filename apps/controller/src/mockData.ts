export const PENLIGHT_COLORS = [
  "#ff2d95",
  "#00e5ff",
  "#b026ff",
  "#39ff14",
  "#fff01f",
  "#ff8c00",
  "#2979ff",
  "#ff1744",
];

export const mockParticipantCount = 248;

export type PermissionStatus = "granted" | "prompt" | "denied";

export const mockInitialPermissions: { mic: PermissionStatus; motion: PermissionStatus } = {
  mic: "prompt",
  motion: "prompt",
};

export const mockBpm = 128;
export const mockCombo = 12;
