export interface ProgressSegment {
  startPct: number;
  endPct: number;
  type: "verse" | "chorus";
}

export interface ProgressBarProps {
  segments: ProgressSegment[];
  progressPct: number;
}

export function ProgressBar({ segments, progressPct }: ProgressBarProps) {
  return (
    <div className="ui-progressbar">
      {segments.map((seg) => (
        <div
          key={`${seg.type}-${seg.startPct}`}
          className={`ui-progressbar__segment ui-progressbar__segment--${seg.type}`}
          style={{ left: `${seg.startPct}%`, width: `${seg.endPct - seg.startPct}%` }}
        />
      ))}
      <div className="ui-progressbar__playhead" style={{ left: `${progressPct}%` }} />
    </div>
  );
}
