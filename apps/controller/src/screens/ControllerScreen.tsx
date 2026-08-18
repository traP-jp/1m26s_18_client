import { useEffect, useState } from "react";
import { Button, ColorPicker, IconToggleButton } from "ui";
import { GlowPanel } from "../components/GlowPanel";
import { PENLIGHT_COLORS, mockBpm, mockCombo } from "../mockData";

export interface ControllerScreenProps {
  color: string;
  onColorChange: (color: string) => void;
}

export function ControllerScreen({ color, onColorChange }: ControllerScreenProps) {
  const [beat, setBeat] = useState(false);
  const [singing, setSinging] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const intervalMs = 60_000 / mockBpm;
    const timer = window.setInterval(() => {
      setBeat(true);
      window.setTimeout(() => setBeat(false), intervalMs * 0.3);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, []);

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
        <span className="controller-combo">COMBO {mockCombo}</span>
      </header>

      <GlowPanel color={color} />

      <ColorPicker colors={PENLIGHT_COLORS} selected={color} onSelect={onColorChange} />

      <div className="controller-live__actions">
        <Button variant="secondary" onClick={() => showToast("スタンプを送信しました(仮)")}>
          スタンプ
        </Button>
        <Button variant="secondary" onClick={() => showToast("風船を送信しました(仮)")}>
          風船
        </Button>
        <IconToggleButton
          active={singing}
          onToggle={() => setSinging((s) => !s)}
          activeLabel="歌っています"
          inactiveLabel="歌う"
          icon="🎤"
        />
      </div>

      {toast && <div className="controller-toast">{toast}</div>}
    </div>
  );
}
