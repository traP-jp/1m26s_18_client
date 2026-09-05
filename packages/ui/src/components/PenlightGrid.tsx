export interface PenlightItem {
  id: string;
  color: string;
  intensity: number;
  /** Shake通算回数。変わるたび振りアニメを最初から再生し直す */
  shakeSeq?: number;
}

export type PenlightWaveMode = "idle" | "fourFloor" | "buildup";

export interface PenlightGridProps {
  lights: PenlightItem[];
  mode?: PenlightWaveMode;
  /** Shake直後の参加者id集合。該当ペンライトを発光+振り動作させる */
  shakingIds?: ReadonlySet<string>;
}

interface RowConfig {
  key: string;
  scale: number;
  opacity: number;
  bottomPct: number;
  saturate: number;
  blurPx: number;
}

const ROWS: RowConfig[] = [
  { key: "row1", scale: 1.55, opacity: 1, bottomPct: 0, saturate: 1, blurPx: 1.4 },
  { key: "row2", scale: 1.08, opacity: 0.99, bottomPct: 28, saturate: 0.82, blurPx: 0.4 },
  { key: "row3", scale: 0.9, opacity: 0.98, bottomPct: 48, saturate: 0.62, blurPx: 0 },
];
const ROW_PATTERN = [2, 1, 2, 0, 1, 2];

const BASE = { left: { x: 15, y: 74 }, right: { x: 25, y: 74 } };
const ROD_LEAN_DEG = 26;
const ROD_LENGTH = 46;

function PenlightRod({
  base,
  color,
  shaking,
}: {
  base: { x: number; y: number };
  color: string;
  shaking?: boolean;
}) {
  const top = base.y - ROD_LENGTH;
  const bodyHalfWidth = 2.75;
  const coreHalfWidth = 1;
  return (
    <>
      <rect
        x={base.x - bodyHalfWidth}
        y={top}
        width={bodyHalfWidth * 2}
        height={ROD_LENGTH}
        rx={bodyHalfWidth}
        className="ui-penlight-grid__rod-body"
        fill={color}
        style={{
          filter: shaking
            ? `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 24px ${color})`
            : `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 11px ${color})`,
        }}
      />
      <rect
        x={base.x - coreHalfWidth}
        y={top + ROD_LENGTH * 0.1}
        width={coreHalfWidth * 2}
        height={ROD_LENGTH * 0.7}
        rx={coreHalfWidth}
        className="ui-penlight-grid__rod-core"
      />
    </>
  );
}

function PenlightLimb({
  side,
  color,
  mode,
  phaseIndex,
  shaking,
  shakeSeq = 0,
}: {
  side: "left" | "right";
  color: string;
  mode: PenlightWaveMode;
  phaseIndex: number;
  shaking?: boolean;
  shakeSeq?: number;
}) {
  const mirror = side === "left" ? -1 : 1;
  const base = BASE[side];

  const groupClass = [
    "ui-penlight-grid__arm-group",
    mode === "fourFloor" && "ui-penlight-grid__arm-group--four-floor",
    mode === "buildup" && "ui-penlight-grid__arm-group--buildup",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <g
      // Shakeのたびキーを変えて再マウントし、振りの途中でも即座に振り直す
      key={shaking ? `${side}-${shakeSeq}` : side}
      className={groupClass}
      style={{
        transformOrigin: `${base.x}px ${base.y}px`,
        // ワンショットの振りは最初から再生するため、wave用の位相ずらしは付けない
        animationDelay: shaking ? "0s" : `${-(phaseIndex % 6) * 0.09}s`,
      }}
    >
      {/* static outward lean lives here (SVG attribute), independent of the
          CSS-animated swing on the wrapping group above */}
      <g transform={`rotate(${mirror * ROD_LEAN_DEG} ${base.x} ${base.y})`}>
        <PenlightRod base={base} color={color} shaking={shaking} />
      </g>
    </g>
  );
}

function PersonMarkup({
  color,
  mode = "idle",
  phaseIndex = 0,
  shaking = false,
  shakeSeq = 0,
}: {
  color: string;
  mode?: PenlightWaveMode;
  phaseIndex?: number;
  shaking?: boolean;
  shakeSeq?: number;
}) {
  return (
    <svg
      className="ui-penlight-grid__svg"
      viewBox="0 0 40 100"
      preserveAspectRatio="none"
      fill="none"
    >
      <ellipse cx={20} cy={97} rx={13} ry={2.6} className="ui-penlight-grid__shadow" />
      <ellipse cx={20} cy={80} rx={10} ry={15} className="ui-penlight-grid__silhouette" />

      <PenlightLimb side="left" color={color} mode={mode} phaseIndex={phaseIndex} shaking={shaking} shakeSeq={shakeSeq} />
      <PenlightLimb side="right" color={color} mode={mode} phaseIndex={phaseIndex} shaking={shaking} shakeSeq={shakeSeq} />
    </svg>
  );
}

function Person({
  light,
  mode,
  phaseIndex,
  shaking,
}: {
  light: PenlightItem;
  mode: PenlightWaveMode;
  phaseIndex: number;
  shaking: boolean;
}) {
  const personClass = [
    "ui-penlight-grid__person",
    mode === "buildup" && "ui-penlight-grid__person--buildup",
    shaking && "ui-penlight-grid__person--shake",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={personClass}
      style={{
        height: `${96 + light.intensity * 26}px`,
        animationDelay: mode === "buildup" ? `${-(phaseIndex % 6) * 0.09}s` : undefined,
      }}
    >
      <PersonMarkup color={light.color} mode={mode} phaseIndex={phaseIndex} shaking={shaking} shakeSeq={light.shakeSeq ?? 0} />
    </span>
  );
}

function ForegroundBokeh({ lights, mode }: { lights: PenlightItem[]; mode: PenlightWaveMode }) {
  const bars = lights.slice(0, 9);
  const barClass = [
    "ui-penlight-grid__bokeh-bar",
    mode === "fourFloor" && "ui-penlight-grid__arm-group--four-floor",
    mode === "buildup" && "ui-penlight-grid__arm-group--buildup",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ui-penlight-grid__bokeh">
      {bars.map((light, i) => (
        <span
          key={light.id}
          className={barClass}
          style={{
            backgroundColor: light.color,
            boxShadow: `0 0 22px ${light.color}, 0 0 48px ${light.color}`,
            height: `${52 + ((i * 37) % 42)}%`,
            left: `${(i / bars.length) * 100}%`,
            animationDelay: `${-(i % 6) * 0.09}s`,
          }}
        />
      ))}
    </div>
  );
}

export function PenlightGrid({ lights, mode = "idle", shakingIds }: PenlightGridProps) {
  const rows: PenlightItem[][] = ROWS.map(() => []);
  lights.forEach((light, i) => {
    rows[ROW_PATTERN[i % ROW_PATTERN.length]].push(light);
  });

  return (
    <div className="ui-penlight-grid">
      {ROWS.map((row, rowIndex) => (
        <div
          key={row.key}
          className="ui-penlight-grid__row"
          style={{
            bottom: `${row.bottomPct}%`,
            opacity: row.opacity,
            transform: `scale(${row.scale})`,
            filter: `saturate(${row.saturate}) blur(${row.blurPx}px)`,
            zIndex: ROWS.length - rowIndex,
          }}
        >
          {rows[rowIndex].map((light, i) => (
            <Person
              key={light.id}
              light={light}
              mode={mode}
              phaseIndex={i}
              shaking={shakingIds?.has(light.id) ?? false}
            />
          ))}
        </div>
      ))}

      {lights.length > 0 && <ForegroundBokeh lights={lights} mode={mode} />}
    </div>
  );
}
