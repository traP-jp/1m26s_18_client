import { useEffect, useRef } from "react";

const VISUALIZER_BAR_COUNT = 28;
const bars = Array.from({ length: VISUALIZER_BAR_COUNT }, (_, i) => i);

export interface BackScreenProps {
  line: string;
  // 増えるたびに1ビート分アンダーラインを光らせる。
  beatPulse?: number;
}

export function BackScreen({ line, beatPulse }: BackScreenProps) {
  const beatBarRef = useRef<HTMLDivElement>(null);

  // https://github.com/TextAliveJp/textalive-app-lyric-sheet と同じダブルrAFの
  // クラス切り替えでアンダーラインのアニメーションをビートのたびに再生する。
  useEffect(() => {
    if (beatPulse === undefined) return;
    const bar = beatBarRef.current;
    if (!bar) return;
    requestAnimationFrame(() => {
      bar.className = "viewer-backscreen__beatbar viewer-backscreen__beatbar--active";
      requestAnimationFrame(() => {
        bar.className =
          "viewer-backscreen__beatbar viewer-backscreen__beatbar--active viewer-backscreen__beatbar--beat";
      });
    });
  }, [beatPulse]);

  return (
    <div className="viewer-backscreen" aria-hidden="true">
      <div className="viewer-backscreen__frame">
        <div className="viewer-backscreen__scanlines" />
        <div className="viewer-backscreen__visualizer">
          {bars.map((i) => (
            <span
              key={i}
              className="viewer-backscreen__bar"
              style={{
                animationDelay: `${-(((i * 37) % 23) / 10)}s`,
                animationDuration: `${0.8 + ((i * 13) % 7) / 10}s`,
              }}
            />
          ))}
        </div>
        <div className="viewer-backscreen__vignette" />
        <span key={line} className="viewer-backscreen__text">
          {line}
        </span>
        <div ref={beatBarRef} className="viewer-backscreen__beatbar" />
      </div>
      <div className="viewer-backscreen__stand" />
    </div>
  );
}
