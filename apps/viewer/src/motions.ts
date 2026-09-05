export interface MotionDefinition {
  id: string;
  label: string;
  url: string;
  
  // モーションが振り付けられた元曲の想定テンポ
  referenceBpm: number;
}

// 全モーションの一元管理場所
export const MOTIONS: MotionDefinition[] = [
  {
    id: "helltaker-verse",
    label: "Helltaker風ダンス(verse)",
    url: "/mmd/motions/Helltaker_like_dance_1min_1.vmd",
    referenceBpm: 119,
  },
  {
    id: "helltaker-chorus",
    label: "Helltaker風ダンス(chorus)",
    url: "/mmd/motions/Helltaker_like_dance_1min_2.vmd",
    referenceBpm: 120,
  },
  {
    id: "pose-capture-test",
    label: "pose capture",
    url: "/mmd/motions/pose-capture.vmd",
    referenceBpm: 120,
  },
  {
    id: "ingrid",
    label: "Ingrid",
    url: "/mmd/motions/ingrid.vmd",
    referenceBpm: 120,
  },
];

export function getMotionById(id: string): MotionDefinition | undefined {
  return MOTIONS.find((m) => m.id === id);
}
