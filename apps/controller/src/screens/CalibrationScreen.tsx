import { useState } from "react";
import { Button, ColorPicker, IconToggleButton, ParticipantCounter, Panel, PENLIGHT_PALETTE } from "ui";
import { ShakeTestArea } from "../components/ShakeTestArea";
import { requestMotionPermission, useMotionStatus, type MotionStatus } from "../motion/useMotion";
import {
  mockInitialPermissions,
  mockParticipantCount,
  type PermissionStatus,
} from "../mockData";

export interface CalibrationScreenProps {
  color: string;
  onColorChange: (color: string) => void;
  onReady: () => void;
}

const STATUS_LABEL: Record<PermissionStatus, string> = {
  granted: "許可済み",
  prompt: "未許可",
  denied: "拒否",
};

const MOTION_STATUS_LABEL: Record<MotionStatus, string> = {
  unsupported: "非対応",
  insecure: "HTTPS が必要",
  prompt: "未許可",
  requesting: "確認中…",
  granted: "許可済み",
  denied: "拒否",
  unavailable: "検出できません",
};

const MOTION_HINT: Partial<Record<MotionStatus, string>> = {
  unsupported: "このブラウザはモーションセンサーに対応していません。試し振りはタップで代替できます。",
  insecure:
    "http 接続のためセンサーを利用できません。https:// で開き直してください(iOS では必須です)。",
  denied:
    "センサーの利用が拒否されました。iOS の場合は Safari を一度終了して開き直す、または 設定 > Safari > 「モーションと画面の向きのアクセス」をオンにしてから再読み込みしてください。",
  unavailable:
    "モーションセンサーを検出できませんでした(PC ブラウザなど)。試し振りはタップで代替できます。",
};

export function CalibrationScreen({ color, onColorChange, onReady }: CalibrationScreenProps) {
  const [permissions, setPermissions] = useState(mockInitialPermissions);
  const [ready, setReady] = useState(false);
  const motion = useMotionStatus();

  const requestMicPermission = () => {
    setPermissions((prev) => ({ ...prev, mic: "granted" }));
  };

  const canRequestMotion = motion.status === "prompt" || motion.status === "unavailable";
  const motionHint = motion.error ?? MOTION_HINT[motion.status];

  return (
    <div className="controller-calibration">
      <header className="controller-calibration__header">
        <ParticipantCounter count={mockParticipantCount} />
      </header>

      <Panel className="controller-calibration__panel">
        <h2 className="controller-panel-title">許可ステータス</h2>
        <div className="controller-permission-row">
          <span>マイク</span>
          <span className="controller-permission-row__status">{STATUS_LABEL[permissions.mic]}</span>
          <Button variant="secondary" onClick={requestMicPermission}>
            許可する
          </Button>
        </div>
        <div className="controller-permission-row">
          <span>モーションセンサー</span>
          <span
            className={`controller-permission-row__status ${
              motion.status === "granted" ? "controller-permission-row__status--ok" : ""
            } ${
              motion.status === "denied" || motion.status === "insecure"
                ? "controller-permission-row__status--error"
                : ""
            }`.trim()}
          >
            {MOTION_STATUS_LABEL[motion.status]}
          </span>
          <Button
            variant="secondary"
            disabled={!canRequestMotion}
            // iOS では requestPermission() をタップハンドラから同期的に呼ぶ必要があるため、間に await を挟まない
            onClick={() => void requestMotionPermission()}
          >
            {motion.status === "granted"
              ? "許可済み"
              : motion.status === "unavailable"
                ? "再試行"
                : "許可する"}
          </Button>
        </div>
        {motionHint && <p className="controller-permission-hint">{motionHint}</p>}
      </Panel>

      <Panel className="controller-calibration__panel">
        <h2 className="controller-panel-title">ペンライトの色</h2>
        <ColorPicker colors={PENLIGHT_PALETTE} selected={color} onSelect={onColorChange} />
      </Panel>

      <Panel className="controller-calibration__panel">
        <h2 className="controller-panel-title">試し振りテスト</h2>
        <ShakeTestArea />
      </Panel>

      <div className="controller-calibration__footer">
        <IconToggleButton
          active={ready}
          onToggle={() => setReady((r) => !r)}
          activeLabel="準備完了しました"
          inactiveLabel="準備完了"
          icon="✓"
        />
        <Button onClick={onReady} disabled={!ready}>
          ライブへ進む
        </Button>
      </div>
    </div>
  );
}
