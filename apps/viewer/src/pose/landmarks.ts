/**
 * MediaPipe Pose Landmarker の 33 点ランドマーク。
 * `worldLandmarks` はメートル単位・腰の中心が原点・x右/y下/z奥(カメラから離れる方向が正)。
 */
export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  /** 0..1 画像内で見えている確からしさ */
  visibility: number;
}

/** 1フレーム分(33点)のワールドランドマーク */
export type PoseFrame = readonly PoseLandmark[];

export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftIndex: 19,
  rightIndex: 20,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;
