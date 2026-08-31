import { useState } from "react";
import { Button, ColorPicker, IconToggleButton, ParticipantCounter, Panel, PENLIGHT_PALETTE } from "ui";
import { ShakeTestArea } from "../components/ShakeTestArea";
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

export function CalibrationScreen({ color, onColorChange, onReady }: CalibrationScreenProps) {
  const [permissions, setPermissions] = useState(mockInitialPermissions);
  const [ready, setReady] = useState(false);

  const requestPermission = (key: "mic" | "motion") => {
    setPermissions((prev) => ({ ...prev, [key]: "granted" }));
  };

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
          <Button variant="secondary" onClick={() => requestPermission("mic")}>
            許可する
          </Button>
        </div>
        <div className="controller-permission-row">
          <span>モーションセンサー</span>
          <span className="controller-permission-row__status">
            {STATUS_LABEL[permissions.motion]}
          </span>
          <Button variant="secondary" onClick={() => requestPermission("motion")}>
            許可する
          </Button>
        </div>
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
