export type Terrain = 'plain' | 'forest' | 'hill' | 'field' | 'water'

function hash01(x: number, y: number, seed: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.13) * 43758.5453123
  return value - Math.floor(value)
}

export function terrainAt(x: number, y: number, seed: number): Terrain {
  const n = hash01(x, y, seed)
  const m = hash01(x + 19, y - 7, seed + 3)
  if (n > 0.9 && m > 0.35) return 'water'
  if (m > 0.74) return 'forest'
  if (n > 0.82) return 'hill'
  if (m < 0.16) return 'field'
  return 'plain'
}
