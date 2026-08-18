import { useState } from "react";

export interface GlowPanelProps {
  color: string;
}

export function GlowPanel({ color }: GlowPanelProps) {
  const [active, setActive] = useState(false);

  return (
    <div
      className={`controller-glow-panel ${active ? "controller-glow-panel--active" : ""}`.trim()}
      style={{ backgroundColor: color, boxShadow: `0 0 ${active ? 90 : 30}px ${color}` }}
      onPointerDown={() => setActive(true)}
      onPointerUp={() => setActive(false)}
      onPointerLeave={() => setActive(false)}
    >
      <span className="controller-glow-panel__hint">
        押している間、光が強くなります(振る動作の代替)
      </span>
    </div>
  );
}
