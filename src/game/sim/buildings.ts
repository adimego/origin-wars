import { BUILDINGS } from '../config/buildings.ts'
import type { BuildingId } from '../config/ids.ts'
import { WORLD } from '../config/world.ts'
import {
  buildCost,
  buildTimeMs,
  effectiveLevels,
  meetsRequirements,
  missingResource,
  queueSlots,
  resourceName,
} from './formulas.ts'
import { payResources, syncTownResources } from './resources.ts'
import { storageCapacity } from './formulas.ts'
import type { GameState, Town } from './types.ts'

export function findTown(state: GameState, id: string): Town | undefined {
  return state.towns.find((town) => town.id === id)
}

export function explainBuild(town: Town, buildingId: BuildingId): string | null {
  const def = BUILDINGS[buildingId]
  const levels = effectiveLevels(town)
  const target = levels[buildingId] + 1
  if (target > def.maxLevel) return `${def.name} is at its highest level.`
  if (town.buildQueue.length >= queueSlots(town.buildings.headquarters)) return 'The build queue is full.'
  if (!meetsRequirements(buildingId, levels)) return 'Requirements are not met yet.'
  const cost = buildCost(buildingId, target)
  const missing = missingResource(town.resources, cost)
  if (missing) return `Not enough ${resourceName(missing)}.`
  return null
}

export function enqueueBuilding(state: GameState, townId: string, buildingId: BuildingId): string | null {
  const town = findTown(state, townId)
  if (!town) return 'That town is gone.'
  syncTownResources(town, state.gameTime)
  const reason = explainBuild(town, buildingId)
  if (reason) return reason
  const levels = effectiveLevels(town)
  const target = levels[buildingId] + 1
  const cost = buildCost(buildingId, target)
  payResources(town.resources, cost)
  town.buildQueue.push({ buildingId, targetLevel: target, completesAt: null, cost })
  startNextBuild(town, state.gameTime)
  return null
}

export function cancelLastBuild(state: GameState, townId: string): string | null {
  const town = findTown(state, townId)
  if (!town) return 'That town is gone.'
  const job = town.buildQueue[town.buildQueue.length - 1]
  if (!job) return 'Nothing is queued.'
  syncTownResources(town, state.gameTime)
  const active = town.buildQueue[0] === job && job.completesAt != null
  const fraction = active ? WORLD.activeCancelRefund : 1
  const cap = storageCapacity(town.buildings.warehouse)
  town.resources.wood = Math.min(cap, town.resources.wood + job.cost.wood * fraction)
  town.resources.clay = Math.min(cap, town.resources.clay + job.cost.clay * fraction)
  town.resources.iron = Math.min(cap, town.resources.iron + job.cost.iron * fraction)
  town.buildQueue.pop()
  if (active) startNextBuild(town, state.gameTime)
  return null
}

export function startNextBuild(town: Town, now: number): void {
  const job = town.buildQueue[0]
  if (!job || job.completesAt != null) return
  if (!meetsRequirements(job.buildingId, town.buildings)) {
    const cap = storageCapacity(town.buildings.warehouse)
    town.resources.wood = Math.min(cap, town.resources.wood + job.cost.wood)
    town.resources.clay = Math.min(cap, town.resources.clay + job.cost.clay)
    town.resources.iron = Math.min(cap, town.resources.iron + job.cost.iron)
    town.buildQueue.shift()
    startNextBuild(town, now)
    return
  }
  const hq = town.buildings.headquarters
  job.completesAt = now + buildTimeMs(job.buildingId, job.targetLevel, hq)
}

/** Apply one finished build. Returns true if a job completed. */
export function completeBuild(town: Town, now: number): boolean {
  const job = town.buildQueue[0]
  if (!job?.completesAt || job.completesAt > now) return false
  syncTownResources(town, job.completesAt)
  town.buildings[job.buildingId] = job.targetLevel
  town.buildQueue.shift()
  startNextBuild(town, job.completesAt)
  return true
}
