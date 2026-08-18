// Every image dropped into src/assets/stamp/ is picked up automatically —
// no code change needed when new stamps are added later.
const stampModules = import.meta.glob<{ default: string }>(
  "./assets/stamp/*.{png,jpg,jpeg,gif,webp}",
  { eager: true },
);

export const stampImages: string[] = Object.values(stampModules).map((mod) => mod.default);
