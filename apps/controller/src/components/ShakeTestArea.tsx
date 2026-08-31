import { useRef, useState } from "react";

const THRESHOLD_PCT = 65;

export function ShakeTestArea() {
  const [level, setLevel] = useState(0);
  const [passCount, setPassCount] = useState(0);
  const [hit, setHit] = useState(false);
  const decayTimer = useRef<number | null>(null);
  const hitTimer = useRef<number | null>(null);

  const triggerShake = () => {
    const spike = 25 + Math.random() * 75;
    setLevel(spike);

    if (spike >= THRESHOLD_PCT) {
      setPassCount((count) => count + 1);
      setHit(true);
      if (hitTimer.current) window.clearTimeout(hitTimer.current);
      hitTimer.current = window.setTimeout(() => setHit(false), 350);
    }

    if (decayTimer.current) window.clearTimeout(decayTimer.current);
    decayTimer.current = window.setTimeout(() => setLevel(0), 120);
  };

  return (
    <button type="button" className="controller-shake-test" onPointerDown={triggerShake}>
      <span className="controller-shake-test__label">試し振りエリア(タップして確認)</span>

      <div className="controller-shake-test__meter">
        <div
          className={`controller-shake-test__meter-fill ${hit ? "controller-shake-test__meter-fill--hit" : ""}`.trim()}
          style={{ width: `${level}%` }}
        />
        <div
          className="controller-shake-test__meter-line"
          style={{ left: `${THRESHOLD_PCT}%` }}
        />
      </div>

      <span className="controller-shake-test__count">成功 {passCount} 回</span>
    </button>
  );
}
