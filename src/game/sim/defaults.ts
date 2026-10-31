import { BUILDING_IDS, UNIT_IDS, type BuildingId, type Resources, type UnitId } from '../config/ids.ts'
import { res } from '../config/ids.ts'
import type { Town, UnitCounts } from './types.ts'

export function emptyUnits(): UnitCounts {
  const units = {} as UnitCounts
  for (const id of UNIT_IDS) units[id] = 0
  return units
}

export function emptyBuildings(): Record<BuildingId, number> {
  const buildings = {} as Record<BuildingId, number>
  for (const id of BUILDING_IDS) buildings[id] = 0
  return buildings
}

export function emptyResources(): Resources {
  return res(0, 0, 0)
}

export function cloneUnits(units: UnitCounts): UnitCounts {
  return { ...units }
}

export function emptyRecruitQueues(): Town['recruitQueues'] {
  return { barracks: null, stable: null, workshop: null, academy: null }
}

export function unitTotal(units: UnitCounts): number {
  let n = 0
  for (const id of UNIT_IDS) n += units[id] ?? 0
  return n
}

export function addUnits(into: UnitCounts, extra: UnitCounts): void {
  for (const id of UNIT_IDS) into[id] += extra[id] ?? 0
}

export function subtractUnits(from: UnitCounts, taken: UnitCounts): void {
  for (const id of UNIT_IDS) from[id] = Math.max(0, from[id] - (taken[id] ?? 0))
}

export function hasUnits(units: UnitCounts): boolean {
  return UNIT_IDS.some((id) => (units[id] ?? 0) > 0)
}

export function zeroUnit(id: UnitId, count: number): UnitCounts {
  const units = emptyUnits()
  units[id] = count
  return units
}
