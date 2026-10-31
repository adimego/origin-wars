import { WORLD } from '../config/world.ts'
import { UNIT_IDS, type UnitId } from '../config/ids.ts'
import { UNITS } from '../config/units.ts'
import { GAME_MINUTE_MS } from './time.ts'
import { emptyUnits, hasUnits } from './defaults.ts'
import type { UnitCounts } from './types.ts'

export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function slowestSpeed(units: UnitCounts): number {
  let slowest = Number.POSITIVE_INFINITY
  for (const id of UNIT_IDS) {
    if ((units[id] ?? 0) > 0) slowest = Math.min(slowest, UNITS[id].speed)
  }
  return Number.isFinite(slowest) ? slowest : 1
}

export function travelMs(dist: number, units: UnitCounts): number {
  const mins = (dist * WORLD.minutesPerField) / slowestSpeed(units)
  return Math.max(WORLD.minActionMs, Math.round(mins * GAME_MINUTE_MS))
}

export function merchantTravelMs(dist: number): number {
  const mins = (dist * WORLD.minutesPerField) / WORLD.market.speed
  return Math.max(WORLD.minActionMs, Math.round(mins * GAME_MINUTE_MS))
}

function isSiegeKit(id: UnitId): boolean {
  return id === 'commander' || id === 'ram' || id === 'catapult'
}

/** When keepSiegeKit is set, rams, catapults, and commanders all go. Otherwise they stay home. */
export function portionUnits(units: UnitCounts, portion: number, keepSiegeKit: boolean): UnitCounts {
  const out = emptyUnits()
  for (const id of UNIT_IDS) {
    if (isSiegeKit(id)) {
      out[id] = keepSiegeKit ? units[id] : 0
      continue
    }
    const count = units[id] ?? 0
    out[id] = Math.min(count, Math.floor(count * portion))
  }
  if (!hasUnits(out) && portion >= 0.45) {
    let best: UnitId | null = null
    let bestCount = 0
    for (const id of UNIT_IDS) {
      if (!keepSiegeKit && isSiegeKit(id)) continue
      if ((units[id] ?? 0) > bestCount) {
        best = id
        bestCount = units[id] ?? 0
      }
    }
    if (best) out[best] = 1
  }
  return out
}

export function normalizeOrder(requested: Partial<UnitCounts>): UnitCounts {
  const units = emptyUnits()
  for (const id of UNIT_IDS) units[id] = Math.max(0, Math.floor(requested[id] ?? 0))
  return units
}
