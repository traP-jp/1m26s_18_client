import { useState } from "react";

export function ShakeTestArea() {
  const [pulses, setPulses] = useState(0);

  return (
    <button
      type="button"
      className="controller-shake-test"
      onPointerDown={() => setPulses((p) => p + 1)}
    >
      <span className="controller-shake-test__label">試し振りエリア(タップして確認)</span>
      <span className="controller-shake-test__count">{pulses}</span>
    </button>
  );
}
