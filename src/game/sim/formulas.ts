import { BALANCE } from '../config/index.ts'
import { BUILDING_IDS, UNIT_IDS, type BuildingId, type Resources, type UnitId } from '../config/ids.ts'
import type { Town, UnitCounts } from './types.ts'
import { WORLD } from '../config/world.ts'
import { BUILDINGS, type BuildingDef } from '../config/buildings.ts'
import { UNITS } from '../config/units.ts'

export function productionPerHour(def: BuildingDef, level: number): number {
  if (!def.production || level <= 0) return 0
  return def.production.basePerHour * def.production.growth ** (level - 1)
}

export function townProduction(town: Town): Resources {
  return {
    wood: productionPerHour(BUILDINGS.timber, town.buildings.timber),
    clay: productionPerHour(BUILDINGS.clay, town.buildings.clay),
    iron: productionPerHour(BUILDINGS.iron, town.buildings.iron),
  }
}

export function storageCapacity(level: number): number {
  if (level <= 0) return WORLD.emptyStorage
  const spec = BUILDINGS.warehouse.storage
  if (!spec) return WORLD.emptyStorage
  return Math.floor(spec.base * spec.growth ** (level - 1))
}

export function populationCapacity(level: number): number {
  if (level <= 0) return WORLD.emptyPopulation
  const spec = BUILDINGS.farm.population
  if (!spec) return WORLD.emptyPopulation
  return Math.floor(spec.base * spec.growth ** (level - 1))
}

export function buildCost(id: BuildingId, targetLevel: number): Resources {
  const def = BUILDINGS[id]
  const factor = def.costFactor ** (targetLevel - 1)
  return {
    wood: Math.round(def.cost.wood * factor),
    clay: Math.round(def.cost.clay * factor),
    iron: Math.round(def.cost.iron * factor),
  }
}

export function buildTimeMs(id: BuildingId, targetLevel: number, hqLevel: number): number {
  const def = BUILDINGS[id]
  const raw = def.timeBaseMs * def.timeFactor ** (targetLevel - 1)
  const discount = WORLD.hqTimeFactor ** Math.max(0, hqLevel)
  return Math.max(WORLD.minActionMs, Math.round(raw / discount))
}

export function queueSlots(hqLevel: number): number {
  const extra = Math.floor(Math.max(0, hqLevel) / WORLD.queueExtraEveryHq)
  return Math.min(WORLD.queueMax, WORLD.queueBase + extra)
}

export function researchMultiplier(level: number): number {
  return 1 + Math.max(0, level) * BALANCE.combat.researchBonusPerLevel
}

export function trainTimeMs(unitId: UnitId, buildingLevel: number): number {
  const unit = UNITS[unitId]
  const speed = WORLD.trainLevelFactor ** Math.max(0, buildingLevel - 1)
  return Math.max(WORLD.minActionMs, Math.round(unit.trainBaseMs / speed))
}

export function researchCost(unitId: UnitId, targetLevel: number): Resources {
  const unit = UNITS[unitId]
  const factor = unit.researchCostFactor ** (targetLevel - 1)
  return {
    wood: Math.round(unit.researchCost.wood * factor),
    clay: Math.round(unit.researchCost.clay * factor),
    iron: Math.round(unit.researchCost.iron * factor),
  }
}

export function researchTimeMs(unitId: UnitId, targetLevel: number, smithyLevel: number): number {
  const unit = UNITS[unitId]
  const raw = unit.researchTimeBaseMs * unit.researchTimeFactor ** (targetLevel - 1)
  const speed = 1.06 ** Math.max(0, smithyLevel - 1)
  return Math.max(WORLD.minActionMs, Math.round(raw / speed))
}

export function popOf(units: UnitCounts): number {
  let n = 0
  for (const id of UNIT_IDS) n += (units[id] ?? 0) * UNITS[id].pop
  return n
}

export function carryOf(units: UnitCounts): number {
  let n = 0
  for (const id of UNIT_IDS) n += (units[id] ?? 0) * UNITS[id].carry
  return n
}

export function townPoints(town: Town): number {
  let n = 0
  for (const id of BUILDING_IDS) n += town.buildings[id]
  return n
}

export function effectiveLevels(town: Town): Record<BuildingId, number> {
  const levels = { ...town.buildings }
  for (const job of town.buildQueue) {
    levels[job.buildingId] = Math.max(levels[job.buildingId], job.targetLevel)
  }
  return levels
}

export function meetsRequirements(id: BuildingId, levels: Record<BuildingId, number>): boolean {
  const reqs = BUILDINGS[id].requires
  for (const key of BUILDING_IDS) {
    const need = reqs[key]
    if (need != null && (levels[key] ?? 0) < need) return false
  }
  return true
}

export function requirementText(id: BuildingId): string | null {
  const reqs = BUILDINGS[id].requires
  const parts: string[] = []
  for (const key of BUILDING_IDS) {
    const need = reqs[key]
    if (need != null) parts.push(`${BUILDINGS[key].name} ${need}`)
  }
  return parts.length ? parts.join(', ') : null
}

export function missingResource(stock: Resources, cost: Resources): 'wood' | 'clay' | 'iron' | null {
  if (stock.wood + 1e-6 < cost.wood) return 'wood'
  if (stock.clay + 1e-6 < cost.clay) return 'clay'
  if (stock.iron + 1e-6 < cost.iron) return 'iron'
  return null
}

export function resourceName(key: 'wood' | 'clay' | 'iron'): string {
  if (key === 'wood') return 'wood'
  if (key === 'clay') return 'clay'
  return 'iron'
}
