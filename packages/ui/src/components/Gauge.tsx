export interface GaugeProps {
  valuePct: number;
  label: string;
  color?: string;
}

export function Gauge({ valuePct, label, color = "var(--color-accent)" }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, valuePct));
  return (
    <div className="ui-gauge">
      <div className="ui-gauge__header">
        <span className="ui-gauge__label">{label}</span>
        <span className="ui-gauge__value">{Math.round(clamped)}%</span>
      </div>
      <div className="ui-gauge__track">
        <div
          className="ui-gauge__fill"
          style={{ width: `${clamped}%`, background: color, color }}
        />
      </div>
    </div>
  );
}
