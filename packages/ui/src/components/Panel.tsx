import type { HTMLAttributes } from "react";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
}

export function Panel({ glow = false, className = "", ...rest }: PanelProps) {
  return (
    <div
      className={`ui-panel ${glow ? "ui-panel--glow" : ""} ${className}`.trim()}
      {...rest}
    />
  );
}
