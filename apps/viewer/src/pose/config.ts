/**
 * MediaPipe の WASM ランタイムと姿勢推定モデルの取得先。
 * オフライン環境で動かす場合は `.env` で差し替える:
 *   VITE_MEDIAPIPE_WASM_URL=/mediapipe/wasm
 *   VITE_POSE_MODEL_URL=/mediapipe/pose_landmarker_lite.task
 * (wasm は node_modules/@mediapipe/tasks-vision/wasm を public/ にコピーすればよい)
 */
export const MEDIAPIPE_WASM_URL: string =
  import.meta.env.VITE_MEDIAPIPE_WASM_URL ??
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";

export const POSE_MODEL_URL: string =
  import.meta.env.VITE_POSE_MODEL_URL ??
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
