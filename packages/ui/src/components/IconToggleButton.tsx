export interface IconToggleButtonProps {
  active: boolean;
  onToggle: () => void;
  activeLabel: string;
  inactiveLabel: string;
  icon?: string;
}

export function IconToggleButton({
  active,
  onToggle,
  activeLabel,
  inactiveLabel,
  icon = "●",
}: IconToggleButtonProps) {
  return (
    <button
      type="button"
      className={`ui-icon-toggle ${active ? "ui-icon-toggle--active" : ""}`.trim()}
      onClick={onToggle}
      aria-pressed={active}
    >
      <span className="ui-icon-toggle__icon">{icon}</span>
      <span className="ui-icon-toggle__label">{active ? activeLabel : inactiveLabel}</span>
    </button>
  );
}
