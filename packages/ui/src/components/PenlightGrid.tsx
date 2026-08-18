export interface PenlightItem {
  id: string;
  color: string;
  intensity: number;
}

export interface PenlightGridProps {
  lights: PenlightItem[];
}

interface RowConfig {
  key: string;
  scale: number;
  opacity: number;
  bottomPct: number;
  saturate: number;
}

// index 0 = front row: closest to camera, biggest, brightest, standing at the very
// bottom. Later rows sit further back: smaller, dimmer, slightly desaturated (haze).
const ROWS: RowConfig[] = [
  { key: "front", scale: 1.25, opacity: 1, bottomPct: 0, saturate: 1 },
  { key: "mid", scale: 0.88, opacity: 0.78, bottomPct: 32, saturate: 0.82 },
  { key: "back", scale: 0.6, opacity: 0.55, bottomPct: 58, saturate: 0.62 },
];
// Out of every 6 people: 1 goes up front, 2 in the middle, 3 in back — smaller/denser
// further back reads as a crowd receding into depth, similar to real perspective.
const ROW_PATTERN = [2, 1, 2, 0, 1, 2];

// Arm geometry: an actual shoulder->elbow->hand chain instead of one smooth
// curve, so the elbow reads as a real joint. angleDeg is measured from
// straight up (0deg), positive rotates toward +x. Coordinates live in the
// person's 0..40 x 0..100 viewBox.
const SHOULDER = { left: { x: 14, y: 32 }, right: { x: 26, y: 32 } };
const UPPER_ARM = { angleDeg: 32, length: 15 };
const FOREARM = { angleDeg: 68, length: 13 };

function polarPoint(origin: { x: number; y: number }, angleDeg: number, length: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: origin.x + length * Math.sin(rad), y: origin.y - length * Math.cos(rad) };
}

function PenlightGlow({
  x,
  y,
  color,
  intensity,
}: {
  x: number;
  y: number;
  color: string;
  intensity: number;
}) {
  return (
    <>
      <circle
        cx={x}
        cy={y}
        r={9}
        className="ui-penlight-grid__glow"
        fill={color}
        style={{ opacity: 0.35 + intensity * 0.35 }}
      />
      <circle cx={x} cy={y} r={4.2} className="ui-penlight-grid__core" fill={color} />
      <circle cx={x} cy={y} r={1.8} className="ui-penlight-grid__hotspot" />
    </>
  );
}

function Arm({ side, color }: { side: "left" | "right"; color: string }) {
  const mirror = side === "left" ? -1 : 1;
  const shoulder = SHOULDER[side];
  const elbow = polarPoint(shoulder, mirror * UPPER_ARM.angleDeg, UPPER_ARM.length);
  const hand = polarPoint(elbow, mirror * FOREARM.angleDeg, FOREARM.length);

  return (
    <>
      <line
        x1={shoulder.x}
        y1={shoulder.y}
        x2={elbow.x}
        y2={elbow.y}
        className="ui-penlight-grid__limb"
        stroke={color}
      />
      <line
        x1={elbow.x}
        y1={elbow.y}
        x2={hand.x}
        y2={hand.y}
        className="ui-penlight-grid__limb"
        stroke={color}
      />
      <circle cx={shoulder.x} cy={shoulder.y} r={2.6} className="ui-penlight-grid__joint" />
      <circle cx={elbow.x} cy={elbow.y} r={2.2} className="ui-penlight-grid__joint" />
      <PenlightGlowAt point={hand} color={color} />
    </>
  );
}

function PenlightGlowAt({
  point,
  color,
}: {
  point: { x: number; y: number };
  color: string;
}) {
  return <PenlightGlow x={point.x} y={point.y} color={color} intensity={0.7} />;
}

/** A standing silhouette: head, torso, two legs planted on the ground (with a
 * contact shadow) and two jointed arms holding penlights overhead. Everything
 * lives in a 0..40 x 0..100 viewBox so the whole figure scales as one unit. */
function PersonMarkup({ color }: { color: string }) {
  return (
    <svg
      className="ui-penlight-grid__svg"
      viewBox="0 0 40 100"
      preserveAspectRatio="none"
      fill="none"
    >
      <ellipse cx={20} cy={97} rx={13} ry={2.6} className="ui-penlight-grid__shadow" />

      <Arm side="left" color={color} />
      <Arm side="right" color={color} />

      <rect x={12} y={62} width={7} height={32} rx={3} className="ui-penlight-grid__leg" />
      <rect x={21} y={62} width={7} height={32} rx={3} className="ui-penlight-grid__leg" />
      <rect x={10} y={91} width={10} height={6} rx={3} className="ui-penlight-grid__foot" />
      <rect x={20} y={91} width={10} height={6} rx={3} className="ui-penlight-grid__foot" />

      <rect
        x={10}
        y={28}
        width={20}
        height={36}
        rx={9}
        className="ui-penlight-grid__torso"
        stroke={color}
      />
      <circle cx={20} cy={20} r={9} className="ui-penlight-grid__head" stroke={color} />
    </svg>
  );
}

function Person({ light }: { light: PenlightItem }) {
  return (
    <span
      className="ui-penlight-grid__person"
      style={{ height: `${96 + light.intensity * 26}px` }}
    >
      <PersonMarkup color={light.color} />
    </span>
  );
}

// The two people nearest the "camera" — i.e. nearest the viewer, who is meant
// to feel like part of the crowd too. Big, dark (barely lit by the stage),
// cropped off the bottom/side edges, the way your own neighbor's shoulder and
// the back of someone's head intrude into frame in a phone video shot from
// inside a real crowd.
function ForegroundNeighbor({
  color,
  side,
}: {
  color: string;
  side: "left" | "right";
}) {
  return (
    <span className={`ui-penlight-grid__neighbor ui-penlight-grid__neighbor--${side}`}>
      <PersonMarkup color={color} />
    </span>
  );
}

export function PenlightGrid({ lights }: PenlightGridProps) {
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
            filter: `saturate(${row.saturate})`,
            zIndex: ROWS.length - rowIndex,
          }}
        >
          {rows[rowIndex].map((light) => (
            <Person key={light.id} light={light} />
          ))}
        </div>
      ))}

      {lights.length > 0 && (
        <>
          <ForegroundNeighbor color={lights[0].color} side="left" />
          <ForegroundNeighbor color={lights[lights.length - 1].color} side="right" />
        </>
      )}
    </div>
  );
}
