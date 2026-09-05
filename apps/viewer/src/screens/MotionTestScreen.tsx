import { useRef, useState } from "react";
import { Button, Panel } from "ui";
import { MikuModel3D } from "../components/MikuModel3D";
import { usePoseLandmarker } from "../pose/usePoseLandmarker";
import { VmdMotionRecorder } from "../pose/VmdMotionRecorder";
import type { PoseTrackerStatus } from "../pose/usePoseLandmarker";
import { MOTIONS, getMotionById } from "../motions";

const DEFAULT_MOTION_ID = "pose-capture-test";
const defaultMotion = getMotionById(DEFAULT_MOTION_ID) ?? MOTIONS[0];

const POSE_STATUS_LABELS: Record<PoseTrackerStatus, string> = {
  idle: "",
  starting: "カメラ・モデル準備中…",
  running: "トラッキング中",
  error: "エラー",
};

function vmdFileName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `motion_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.vmd`;
}

// ライブ画面(LiveScreen)はMikuが「▶ ライブ開始」を押すまで非表示になるため、
// 本番の部屋接続・LiveStart送信を経由せずにMikuの姿を見ながらモーションを
// 録画したい場合はこちらを使う(曲データ・視聴者接続には一切触れない)。
export function MotionTestScreen() {
  const [url, setUrl] = useState(defaultMotion.url);
  const [referenceBpm, setReferenceBpm] = useState(defaultMotion.referenceBpm);
  const [testBpm, setTestBpm] = useState(120);

  const [poseEnabled, setPoseEnabled] = useState(false);
  const [poseMirror, setPoseMirror] = useState(true);
  const pose = usePoseLandmarker(poseEnabled);
  const vmdRecorderRef = useRef<VmdMotionRecorder | null>(null);
  vmdRecorderRef.current ??= new VmdMotionRecorder();
  const [vmdRecording, setVmdRecording] = useState(false);

  const startVmdRecording = () => {
    vmdRecorderRef.current?.start();
    setVmdRecording(true);
  };

  /** 録画を止め、1フレーム以上あれば .vmd をダウンロードさせる */
  const stopVmdRecordingAndSave = () => {
    setVmdRecording(false);
    const recorder = vmdRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
    if (recorder.frameCount === 0) return;
    const blob = new Blob([recorder.toVmd()], { type: "application/octet-stream" });
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = vmdFileName();
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <div className="viewer-motion-test">
      <Panel className="viewer-motion-test__card">
        <p className="stage-eyebrow">開発用</p>
        <h1 className="viewer-title">モーション単体テスト・録画</h1>

        <label className="viewer-motion-test__field">
          登録済みモーションから選択
          <select
            className="viewer-url-input__field"
            onChange={(e) => {
              const motion = getMotionById(e.target.value);
              if (!motion) return;
              setUrl(motion.url);
              setReferenceBpm(motion.referenceBpm);
            }}
            defaultValue={defaultMotion.id}
          >
            {MOTIONS.map((motion) => (
              <option key={motion.id} value={motion.id}>
                {motion.label}
              </option>
            ))}
          </select>
        </label>

        <label className="viewer-motion-test__field">
          モーションURL(直接指定も可)
          <input
            className="viewer-url-input__field"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>

        <label className="viewer-motion-test__field">
          このモーションの想定BPM(referenceBpm)
          <input
            className="viewer-url-input__field"
            type="number"
            value={referenceBpm}
            onChange={(e) => setReferenceBpm(Number(e.target.value) || 0)}
          />
        </label>

        <label className="viewer-motion-test__field">
          テストする曲のBPM
          <input
            className="viewer-url-input__field"
            type="number"
            value={testBpm}
            onChange={(e) => setTestBpm(Number(e.target.value) || 0)}
          />
        </label>

        <p className="viewer-hint">
          再生速度倍率: {(testBpm / (referenceBpm || 1)).toFixed(2)}倍(0.5〜2倍にクランプされます)
        </p>

        <div className="viewer-motion-test__field">
          モーション録画(カメラで撮ったポーズをMikuに反映してVMD保存)
          <div className="viewer-motion-test__record-controls">
            <Button
              variant={poseEnabled ? "primary" : "ghost"}
              onClick={() => {
                if (poseEnabled && vmdRecording) stopVmdRecordingAndSave();
                setPoseEnabled((v) => !v);
              }}
            >
              {poseEnabled ? "モーション ON" : "モーション OFF"}
            </Button>
            {poseEnabled && (
              <Button variant={poseMirror ? "primary" : "ghost"} onClick={() => setPoseMirror((v) => !v)}>
                鏡
              </Button>
            )}
            {poseEnabled && (
              <Button
                variant={vmdRecording ? "primary" : "ghost"}
                onClick={vmdRecording ? stopVmdRecordingAndSave : startVmdRecording}
              >
                {vmdRecording ? "■ VMD保存" : "● VMD録画"}
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <div className="viewer-motion-test__stage">
        <MikuModel3D
          key={url}
          bpm={testBpm}
          motionOverride={{ url, referenceBpm }}
          poseFrameRef={pose.frameRef}
          poseImageFrameRef={pose.imageFrameRef}
          mirror={poseMirror}
          vmdRecorder={vmdRecorderRef.current}
          showStageDecor={false}
        />
        {poseEnabled && (
          <div className={`viewer-pose-preview${poseMirror ? " viewer-pose-preview--mirror" : ""}`}>
            <video ref={pose.videoRef} muted playsInline />
            <span className="viewer-pose-preview__status">
              {pose.status === "error" ? `エラー: ${pose.error ?? ""}` : POSE_STATUS_LABELS[pose.status]}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
