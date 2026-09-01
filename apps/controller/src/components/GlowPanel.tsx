import { useRef, useState } from "react";
import { SHAKE_THRESHOLD_PCT, useMotionIntensity, useShake } from "../motion/useMotion";

export interface GlowPanelProps {
  color: string;
}

const MIN_GLOW_PX = 30;
const MAX_GLOW_PX = 110;

export function GlowPanel({ color }: GlowPanelProps) {
  const [pressed, setPressed] = useState(false);
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const intensity = useMotionIntensity();

  // しきい値を超える振りが検出された瞬間だけ強く光らせる
  useShake((shake) => {
    if (shake.intensity < SHAKE_THRESHOLD_PCT) return;
    setFlash(true);
    if (flashTimer.current) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 160);
  });

  // 実センサーの強度と、押している間の代替操作のどちらか強い方を採用
  const glow = flash ? 100 : Math.max(intensity, pressed ? 100 : 0);
  const glowPx = MIN_GLOW_PX + ((MAX_GLOW_PX - MIN_GLOW_PX) * glow) / 100;
  const active = glow >= SHAKE_THRESHOLD_PCT;

  return (
    <div
      className={`controller-glow-panel ${active ? "controller-glow-panel--active" : ""}`.trim()}
      style={{
        backgroundColor: color,
        boxShadow: `0 0 ${glowPx}px ${color}`,
        filter: `brightness(${1 + glow / 250})`,
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
    />
  );
}
