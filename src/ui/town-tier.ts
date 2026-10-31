export type BuildingTier = 0 | 1 | 2 | 3

/** Level 0 is bare ground. Later levels split the building's own range into wood, stone, and grand. */
export function buildingTier(level: number, maxLevel: number): BuildingTier {
  if (level <= 0 || maxLevel <= 0) return 0
  if (maxLevel <= 1) return 1
  const step = maxLevel / 3
  if (level <= step) return 1
  if (level <= step * 2) return 2
  return 3
}
