import type { BuildingId } from '@/game/config/ids.ts'

export const SCENE_W = 480
export const SCENE_H = 440
export const CENTER = { x: 240, y: 214 }
export const WALL_R = 168
export const OUTER_R = 116
export const INNER_R = 62

export interface Plot {
  id: BuildingId
  x: number
  y: number
  r: number
  angle: number
}

export type FillerKind = 'tree' | 'cottage' | 'garden' | 'barrels' | 'cart' | 'fence'

export interface FillerSpot {
  kind: FillerKind
  x: number
  y: number
  variant: number
}

/** Clockwise from just west of the south gate, then the inner ring, then the keep. */
const OUTER: BuildingId[] = ['farm', 'timber', 'barracks', 'stable', 'iron', 'clay', 'smithy', 'workshop']
const INNER: BuildingId[] = ['market', 'rally', 'warehouse', 'academy']

export function buildingPlots(): Plot[] {
  const plots: Plot[] = [{ id: 'headquarters', x: CENTER.x, y: CENTER.y, r: 0, angle: -Math.PI / 2 }]
  const outerStep = (Math.PI * 2) / OUTER.length
  for (let i = 0; i < OUTER.length; i++) {
    const angle = Math.PI / 2 + outerStep / 2 + i * outerStep
    plots.push(place(OUTER[i], angle, OUTER_R))
  }
  const innerAngles = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4]
  for (let i = 0; i < INNER.length; i++) plots.push(place(INNER[i], innerAngles[i], INNER_R))
  return plots
}

function place(id: BuildingId, angle: number, r: number): Plot {
  return {
    id,
    angle,
    r,
    x: CENTER.x + Math.cos(angle) * r,
    y: CENTER.y + Math.sin(angle) * r,
  }
}

export function angleDelta(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/** A hamlet stays a meadow. Points add cottages, gardens, and stalls inside the wall. */
export function fillerCount(points: number): number {
  return Math.min(48, 7 + Math.floor(Math.max(0, points - 6) * 0.55))
}

export function fillerSpots(points: number, seed: string): FillerSpot[] {
  const want = fillerCount(points)
  const rng = mulberry32(hashString(seed) || 1)
  const spots: FillerSpot[] = []
  const plots = buildingPlots()

  const clear = (x: number, y: number, gate: boolean) => {
    if (x < 10 || y < 10 || x > SCENE_W - 10 || y > SCENE_H - 12) return false
    const dx = x - CENTER.x
    const dy = y - CENTER.y
    const dist = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    if (gate && dist > 72 && Math.abs(angleDelta(angle, Math.PI / 2)) < 0.32) return false
    if (plots.some((plot) => Math.hypot(plot.x - x, plot.y - y) < (plot.id === 'headquarters' ? 34 : 26))) return false
    if (spots.some((spot) => Math.hypot(spot.x - x, spot.y - y) < 15)) return false
    return true
  }

  const tryPlace = (kind: FillerKind, minR: number, maxR: number, gate: boolean) => {
    for (let n = 0; n < 24; n++) {
      const angle = rng() * Math.PI * 2
      const dist = minR + rng() * (maxR - minR)
      const x = CENTER.x + Math.cos(angle) * dist
      const y = CENTER.y + Math.sin(angle) * dist
      if (!clear(x, y, gate)) continue
      spots.push({ kind, x, y, variant: Math.floor(rng() * 3) })
      return
    }
  }

  const outside = Math.min(want, 9)
  for (let i = 0; i < outside; i++) tryPlace('tree', WALL_R + 10, WALL_R + 30, false)
  const inside = want - outside
  for (let i = 0; i < inside; i++) {
    const kind = fillerKind(i, points)
    tryPlace(kind, kind === 'cottage' ? 78 : 48, WALL_R - 18, true)
  }
  return spots
}

function fillerKind(index: number, points: number): FillerKind {
  if (points < 18) return index % 3 === 0 ? 'barrels' : index % 3 === 1 ? 'fence' : 'tree'
  if (points > 45 && index % 2 === 0) return 'cottage'
  const cycle: FillerKind[] = ['cottage', 'garden', 'tree', 'barrels', 'cottage', 'cart', 'fence', 'garden']
  return cycle[index % cycle.length]
}

function hashString(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
