const stampModules = import.meta.glob<{ default: string }>(
  "./assets/stamp/*.{png,jpg,jpeg,gif,webp}",
  { eager: true },
);

export const stampImages: string[] = Object.values(stampModules).map((mod) => mod.default);
