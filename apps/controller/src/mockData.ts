export const mockParticipantCount = 248;

export type PermissionStatus = "granted" | "prompt" | "denied";

// モーションセンサーの許可状態は src/motion/motionSensor.ts が実際の DeviceMotionEvent から管理する
export const mockInitialPermissions: { mic: PermissionStatus } = {
  mic: "prompt",
};

export const mockBpm = 128;
