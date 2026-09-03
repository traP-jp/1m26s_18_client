import { useRef, useState } from "react";
import {
  SHAKE_THRESHOLD_PCT,
  useMotionIntensity,
  useMotionStatus,
  useShake,
} from "../motion/useMotion";

export function ShakeTestArea() {
  const { status } = useMotionStatus();
  const sensorActive = status === "granted";
  const sensorIntensity = useMotionIntensity();

  const [tapLevel, setTapLevel] = useState(0);
  const [passCount, setPassCount] = useState(0);
  const [hit, setHit] = useState(false);
  const decayTimer = useRef<number | null>(null);
  const hitTimer = useRef<number | null>(null);

  const registerPass = () => {
    setPassCount((count) => count + 1);
    setHit(true);
    if (hitTimer.current) window.clearTimeout(hitTimer.current);
    hitTimer.current = window.setTimeout(() => setHit(false), 350);
  };

  // 実センサー: しきい値を超えた振りが 1 回検出されるごとに成功カウント
  useShake((shake) => {
    if (shake.intensity >= SHAKE_THRESHOLD_PCT) registerPass();
  });

  // センサーが使えない環境向けのフォールバック(タップでランダムな強さを疑似生成)
  const simulateShake = () => {
    const spike = 25 + Math.random() * 75;
    setTapLevel(spike);
    if (spike >= SHAKE_THRESHOLD_PCT) registerPass();
    if (decayTimer.current) window.clearTimeout(decayTimer.current);
    decayTimer.current = window.setTimeout(() => setTapLevel(0), 120);
  };

  const level = sensorActive ? sensorIntensity : tapLevel;

  return (
    <button
      type="button"
      className={`controller-shake-test ${sensorActive ? "controller-shake-test--live" : ""}`.trim()}
      onPointerDown={sensorActive ? undefined : simulateShake}
    >
      <span className="controller-shake-test__label">
        {sensorActive ? "スマホを振ってみてください" : "試し振りエリア(タップして確認)"}
      </span>

      <div className="controller-shake-test__meter">
        <div
          className={`controller-shake-test__meter-fill ${
            hit ? "controller-shake-test__meter-fill--hit" : ""
          } ${sensorActive ? "controller-shake-test__meter-fill--live" : ""}`.trim()}
          style={{ width: `${level}%` }}
        />
        <div
          className="controller-shake-test__meter-line"
          style={{ left: `${SHAKE_THRESHOLD_PCT}%` }}
        />
      </div>

      <span className="controller-shake-test__count">成功 {passCount} 回</span>
    </button>
  );
}
