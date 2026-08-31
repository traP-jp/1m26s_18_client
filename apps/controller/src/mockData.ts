export const mockParticipantCount = 248;

export type PermissionStatus = "granted" | "prompt" | "denied";

export const mockInitialPermissions: { mic: PermissionStatus; motion: PermissionStatus } = {
  mic: "prompt",
  motion: "prompt",
};

export const mockBpm = 128;
export const mockCombo = 12;
