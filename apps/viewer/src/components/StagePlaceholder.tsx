import { PENLIGHT_PALETTE } from "ui";

const GRAIN_DATA_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>
      <filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter>
      <rect width='100%' height='100%' filter='url(#n)'/>
    </svg>`,
  );

function Spotlight({ variant }: { variant: "left" | "center" | "right" }) {
  return (
    <div className={`viewer-stage-placeholder__spotlight viewer-stage-placeholder__spotlight--${variant}`}>
      <span className="viewer-stage-placeholder__spotlight-halo" />
      <span className="viewer-stage-placeholder__spotlight-rays" />
      <span className="viewer-stage-placeholder__spotlight-core" />
    </div>
  );
}

export function StagePlaceholder() {
  return (
    <div className="viewer-stage-placeholder" aria-hidden="true">
      <div className="viewer-stage-placeholder__bg" />
      <div className="viewer-stage-placeholder__wash viewer-stage-placeholder__wash--a" />
      <div className="viewer-stage-placeholder__wash viewer-stage-placeholder__wash--b" />

      <div className="viewer-stage-placeholder__truss">
        {PENLIGHT_PALETTE.map((color, i) => (
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

      <div
        className="viewer-stage-placeholder__grain"
        style={{ backgroundImage: `url("${GRAIN_DATA_URL}")` }}
      />
      <div className="viewer-stage-placeholder__vignette" />

      <span className="viewer-stage-placeholder__label">
        STAGE VISUAL (three.js / PixiJS 実装予定)
      </span>
    </div>
  );
}
