import { BUILDINGS } from '../config/buildings.ts'
import type { UnitId } from '../config/ids.ts'
import { SIEGE } from '../config/world.ts'
import { UNITS } from '../config/units.ts'
import { missingResource, researchCost, researchTimeMs, resourceName, trainTimeMs } from './formulas.ts'
import { freePopulation } from './population.ts'
import { payResources, syncTownResources } from './resources.ts'
import { findTown } from './buildings.ts'
import type { GameState, Town } from './types.ts'

export function unitUnlocked(town: Town, unitId: UnitId): boolean {
  const unit = UNITS[unitId]
  if (town.buildings[unit.trainBuilding] < 1) return false
  if (!unit.requiresResearch) return true
  return (town.research[unitId] ?? 0) >= 1
}

export function explainRecruit(state: GameState, town: Town, unitId: UnitId, count: number): string | null {
  const unit = UNITS[unitId]
  if (count < 1 || !Number.isFinite(count)) return 'Choose how many to train.'
  if (town.buildings[unit.trainBuilding] < 1) {
    return `Build a ${BUILDINGS[unit.trainBuilding].name.toLowerCase()} first.`
  }
  if (unit.requiresResearch && (town.research[unitId] ?? 0) < 1) {
    return `Research ${unit.name.toLowerCase()}s at the smithy first.`
  }
  const queue = town.recruitQueues[unit.trainBuilding]
  if (queue && queue.unitId !== unitId) return `${BUILDINGS[unit.trainBuilding].name} is already training.`
  const cost = {
    wood: unit.cost.wood * count,
    clay: unit.cost.clay * count,
    iron: unit.cost.iron * count,
  }
  const missing = missingResource(town.resources, cost)
  if (missing) return `Not enough ${resourceName(missing)}.`
  const pop = unit.pop * count
  if (pop > freePopulation(town, state) + 1e-6) return 'The farm cannot feed that many.'
  return null
}

export function enqueueRecruit(state: GameState, townId: string, unitId: UnitId, count: number): string | null {
  const town = findTown(state, townId)
  if (!town) return 'That town is gone.'
  const whole = Math.floor(count)
  syncTownResources(town, state.gameTime, town.workPace > 1 ? SIEGE.productionFactor : 1)
  const reason = explainRecruit(state, town, unitId, whole)
  if (reason) return reason
  const unit = UNITS[unitId]
  payResources(town.resources, {
    wood: unit.cost.wood * whole,
    clay: unit.cost.clay * whole,
    iron: unit.cost.iron * whole,
  })
  const pace = town.workPace > 0 ? town.workPace : 1
  const perUnitMs = Math.round(trainTimeMs(unitId, town.buildings[unit.trainBuilding]) * pace)
  const existing = town.recruitQueues[unit.trainBuilding]
  if (existing && existing.unitId === unitId) {
    existing.remaining += whole
    return null
  }
  town.recruitQueues[unit.trainBuilding] = {
    unitId,
    remaining: whole,
    perUnitMs,
    nextAt: state.gameTime + perUnitMs,
  }
  return null
}

export function completeRecruit(town: Town, building: keyof Town['recruitQueues'], now: number): boolean {
  const job = town.recruitQueues[building]
  if (!job || job.nextAt > now) return false
  town.units[job.unitId] += 1
  job.remaining -= 1
  if (job.remaining <= 0) town.recruitQueues[building] = null
  else job.nextAt += job.perUnitMs
  return true
}

export function explainResearch(town: Town, unitId: UnitId): string | null {
  const unit = UNITS[unitId]
  if (unit.researchMax <= 0) return `${unit.name}s are not researched.`
  if (town.buildings.smithy < 1) return 'Build a smithy first.'
  if (town.researchJob) return 'The smithy is already at work.'
  const current = town.research[unitId] ?? 0
  const target = current + 1
  if (target > unit.researchMax) return `${unit.name} research is finished.`
  if (town.buildings.smithy < target) return `Smithy level ${target} is required.`
  const cost = researchCost(unitId, target)
  const missing = missingResource(town.resources, cost)
  if (missing) return `Not enough ${resourceName(missing)}.`
  return null
}

export function startResearch(state: GameState, townId: string, unitId: UnitId): string | null {
  const town = findTown(state, townId)
  if (!town) return 'That town is gone.'
  syncTownResources(town, state.gameTime, town.workPace > 1 ? SIEGE.productionFactor : 1)
  const reason = explainResearch(town, unitId)
  if (reason) return reason
  const target = (town.research[unitId] ?? 0) + 1
  const cost = researchCost(unitId, target)
  payResources(town.resources, cost)
  const pace = town.workPace > 0 ? town.workPace : 1
  town.researchJob = {
    unitId,
    targetLevel: target,
    completesAt: state.gameTime + Math.round(researchTimeMs(unitId, target, town.buildings.smithy) * pace),
    cost,
  }
  return null
}

export function completeResearch(town: Town, now: number): boolean {
  const job = town.researchJob
  if (!job || job.completesAt > now) return false
  town.research[job.unitId] = job.targetLevel
  town.researchJob = null
  return true
}

export function maxAffordable(town: Town, state: GameState, unitId: UnitId): number {
  const unit = UNITS[unitId]
  if (!unitUnlocked(town, unitId)) return 0
  const byWood = unit.cost.wood > 0 ? Math.floor(town.resources.wood / unit.cost.wood) : 9999
  const byClay = unit.cost.clay > 0 ? Math.floor(town.resources.clay / unit.cost.clay) : 9999
  const byIron = unit.cost.iron > 0 ? Math.floor(town.resources.iron / unit.cost.iron) : 9999
  const byPop = unit.pop > 0 ? Math.floor(freePopulation(town, state) / unit.pop) : 9999
  return Math.max(0, Math.min(byWood, byClay, byIron, byPop, 400))
}
