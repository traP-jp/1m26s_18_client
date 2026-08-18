export interface ParticipantCounterProps {
  count: number;
  label?: string;
}

export function ParticipantCounter({ count, label = "参加人数" }: ParticipantCounterProps) {
  return (
    <div className="ui-participant-counter">
      <span className="ui-participant-counter__count">{count.toLocaleString()}</span>
      <span className="ui-participant-counter__label">{label}</span>
    </div>
  );
}
