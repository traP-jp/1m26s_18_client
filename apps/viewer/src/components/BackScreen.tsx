const VISUALIZER_BAR_COUNT = 28;
const bars = Array.from({ length: VISUALIZER_BAR_COUNT }, (_, i) => i);

export interface BackScreenProps {
  line: string;
}

export function BackScreen({ line }: BackScreenProps) {
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
        <span className="viewer-backscreen__text">{line}</span>
      </div>
      <div className="viewer-backscreen__stand" />
    </div>
  );
}
