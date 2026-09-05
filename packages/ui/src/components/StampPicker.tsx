export interface StampPickerItem {
  id: number;
  name: string;
  src: string;
}

export interface StampPickerProps {
  stamps: readonly StampPickerItem[];
  onSelect: (id: number) => void;
  disabled?: boolean;
}

export function StampPicker({ stamps, onSelect, disabled = false }: StampPickerProps) {
  return (
    <div className="ui-stamp-picker">
      {stamps.map((stamp) => (
        <button
          key={stamp.id}
          type="button"
          aria-label={stamp.name}
          title={stamp.name}
          className="ui-stamp-picker__button"
          disabled={disabled}
          onClick={() => onSelect(stamp.id)}
        >
          <img className="ui-stamp-picker__image" src={stamp.src} alt="" draggable={false} />
        </button>
      ))}
    </div>
  );
}
