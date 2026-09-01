import { useEffect, useState } from "react";
import { Button, ColorPicker, PENLIGHT_PALETTE } from "ui";
import { GlowPanel } from "../components/GlowPanel";
import { VoiceMeter } from "../components/VoiceMeter";
import {
  requestMotionPermission,
  SHAKE_THRESHOLD_PCT,
  useMotionStatus,
  useShake,
} from "../motion/useMotion";
import { mockBpm } from "../mockData";

export interface ControllerScreenProps {
  color: string;
  onColorChange: (color: string) => void;
}

export function ControllerScreen({ color, onColorChange }: ControllerScreenProps) {
  const [beat, setBeat] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // TODO: ビート同期判定(issue #6)実装後は「ビートに合った振り」のみカウントする
  const [combo, setCombo] = useState(0);
  const motion = useMotionStatus();

  useEffect(() => {
    const intervalMs = 60_000 / mockBpm;
    const timer = window.setInterval(() => {
      setBeat(true);
      window.setTimeout(() => setBeat(false), intervalMs * 0.3);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, []);

  useShake((shake) => {
    if (shake.intensity < SHAKE_THRESHOLD_PCT) return;
    setCombo((c) => c + 1);
    // TODO: WebSocket 実装後、ここで { type: "shake", intensity: shake.intensity } をサーバーへ送信する
  });

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1200);
  };

  return (
    <div className="controller-live">
      <header className="controller-live__header">
        <div
          className={`controller-beat-dot ${beat ? "controller-beat-dot--pulse" : ""}`.trim()}
        />
        <span className="controller-combo">COMBO {combo}</span>
        {/* キャリブレーションを経由せず直接開いた場合(iOS)向けの許可導線 */}
        {(motion.status === "prompt" || motion.status === "requesting") && (
          <Button
            variant="ghost"
            className="controller-live__motion-button"
            disabled={motion.status === "requesting"}
            onClick={() => void requestMotionPermission()}
          >
            {motion.status === "requesting" ? "確認中…" : "センサーを有効化"}
          </Button>
        )}
      </header>

      <GlowPanel color={color} />

      <ColorPicker colors={PENLIGHT_PALETTE} selected={color} onSelect={onColorChange} />

      <div className="controller-live__actions">
        <Button variant="secondary" onClick={() => showToast("スタンプを送信しました(仮)")}>
          スタンプ
        </Button>
        <Button variant="secondary" onClick={() => showToast("風船を送信しました(仮)")}>
          風船
        </Button>
        <VoiceMeter />
      </div>

      {toast && <div className="controller-toast">{toast}</div>}
    </div>
  );
}
