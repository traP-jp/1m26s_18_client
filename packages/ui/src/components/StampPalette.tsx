import { useMemo, useState } from "react";
import { StampPicker } from "./StampPicker";
import type { StampPickerItem } from "./StampPicker";

export interface StampPaletteProps {
  stamps: readonly StampPickerItem[];
  onSelect: (id: number) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * 検索欄付きのスタンプパレット。スタンプ名の部分一致で絞り込み、
 * 前方一致するものを先頭に並べる。
 */
export function StampPalette({
  stamps,
  onSelect,
  disabled = false,
  placeholder = "スタンプ名で検索",
}: StampPaletteProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedQuery) return stamps;
    const prefix: StampPickerItem[] = [];
    const partial: StampPickerItem[] = [];
    for (const stamp of stamps) {
      const name = stamp.name.toLowerCase();
      if (name.startsWith(normalizedQuery)) prefix.push(stamp);
      else if (name.includes(normalizedQuery)) partial.push(stamp);
    }
    return [...prefix, ...partial];
  }, [stamps, normalizedQuery]);

  return (
    <div className="ui-stamp-palette">
      <input
        type="search"
        className="ui-stamp-palette__search"
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="ui-stamp-palette__grid">
        {filtered.length > 0 ? (
          <StampPicker stamps={filtered} onSelect={onSelect} disabled={disabled} />
        ) : (
          <p className="ui-stamp-palette__empty">「{query.trim()}」に一致するスタンプはありません</p>
        )}
      </div>
    </div>
  );
}
