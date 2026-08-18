export interface ReactionItem {
  id: string;
  kind: "stamp" | "balloon";
  imageSrc: string;
  leftPct: number;
}

export interface ReactionOverlayProps {
  items: ReactionItem[];
  onItemDone: (id: string) => void;
}

export function ReactionOverlay({ items, onItemDone }: ReactionOverlayProps) {
  return (
    <div className="ui-reaction-overlay">
      {items.map((item) => (
        <span
          key={item.id}
          className={`ui-reaction-overlay__item ui-reaction-overlay__item--${item.kind}`}
          style={{ left: `${item.leftPct}%` }}
          onAnimationEnd={() => onItemDone(item.id)}
        >
          <img className="ui-reaction-overlay__image" src={item.imageSrc} alt="" />
        </span>
      ))}
    </div>
  );
}
