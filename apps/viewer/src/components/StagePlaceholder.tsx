const TRUSS_LIGHT_COLORS = [
  "#00e5ff",
  "#fff01f",
  "#ff8c00",
  "#ff00d9",
  "#2979ff",
  "#ff1744",
  "#00e5ff",
];

function Spotlight({ variant }: { variant: "left" | "center" | "right" }) {
  return (
    <div className={`viewer-stage-placeholder__spotlight viewer-stage-placeholder__spotlight--${variant}`}>
      <span className="viewer-stage-placeholder__spotlight-halo" />
      <span className="viewer-stage-placeholder__spotlight-core" />
    </div>
  );
}

export function StagePlaceholder() {
  return (
    <div className="viewer-stage-placeholder" aria-hidden="true">
      <div className="viewer-stage-placeholder__bg" />

      <div className="viewer-stage-placeholder__truss">
        {TRUSS_LIGHT_COLORS.map((color, i) => (
          <span
            key={i}
            className="viewer-stage-placeholder__truss-light"
            style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}, 0 30px 40px ${color}` }}
          />
        ))}
      </div>

      <Spotlight variant="left" />
      <Spotlight variant="center" />
      <Spotlight variant="right" />

      <div className="viewer-stage-placeholder__haze">
        <span className="viewer-stage-placeholder__haze-cloud viewer-stage-placeholder__haze-cloud--a" />
        <span className="viewer-stage-placeholder__haze-cloud viewer-stage-placeholder__haze-cloud--b" />
        <span className="viewer-stage-placeholder__haze-cloud viewer-stage-placeholder__haze-cloud--c" />
      </div>

      <div className="viewer-stage-placeholder__floor" />

      <span className="viewer-stage-placeholder__label">
        STAGE VISUAL (three.js / PixiJS 実装予定)
      </span>
    </div>
  );
}
