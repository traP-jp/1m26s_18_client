import { useState } from "react";
import { Panel } from "ui";
import { MikuModel3D } from "../components/MikuModel3D";
import { MOTIONS, getMotionById } from "../motions";

const DEFAULT_MOTION_ID = "pose-capture-test";
const defaultMotion = getMotionById(DEFAULT_MOTION_ID) ?? MOTIONS[0];

export function MotionTestScreen() {
  const [url, setUrl] = useState(defaultMotion.url);
  const [referenceBpm, setReferenceBpm] = useState(defaultMotion.referenceBpm);
  const [testBpm, setTestBpm] = useState(120);

  return (
    <div className="viewer-motion-test">
      <Panel className="viewer-motion-test__card">
        <p className="viewer-eyebrow">開発用</p>
        <h1 className="viewer-title">モーション単体テスト</h1>
        {/* <p className="viewer-subtitle">
          曲データを使わず、モーション1本とBPMの組み合わせだけを試せます。
        </p> */}

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
      </Panel>

      <div className="viewer-motion-test__stage">
        <MikuModel3D key={url} bpm={testBpm} motionOverride={{ url, referenceBpm }} />
      </div>
    </div>
  );
}
