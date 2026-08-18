export interface ColorPickerProps {
  colors: string[];
  selected: string;
  onSelect: (color: string) => void;
}

export function ColorPicker({ colors, selected, onSelect }: ColorPickerProps) {
  return (
    <div className="ui-color-picker">
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          className={`ui-color-picker__swatch ${
            color === selected ? "ui-color-picker__swatch--selected" : ""
          }`.trim()}
          style={{ backgroundColor: color }}
          onClick={() => onSelect(color)}
        />
      ))}
    </div>
  );
}
