const GRAIN_DATA_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'>
      <filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter>
      <rect width='100%' height='100%' filter='url(#n)'/>
    </svg>`,
  );

// トラス・スポットライトは MikuModel3D 側で実際の3Dオブジェクトとして描画するので
// ここでは背景・ヘイズ・床など「Miku単体のcanvasでは覆いきれない全画面の雰囲気」だけ担当する。
export function StagePlaceholder() {
  return (
    <div className="viewer-stage-placeholder" aria-hidden="true">
      <div className="viewer-stage-placeholder__bg" />
      <div className="viewer-stage-placeholder__wash viewer-stage-placeholder__wash--a" />
      <div className="viewer-stage-placeholder__wash viewer-stage-placeholder__wash--b" />

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
    </div>
  );
}
