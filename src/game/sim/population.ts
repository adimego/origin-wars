import { UNIT_IDS } from '../config/ids.ts'
import { UNITS } from '../config/units.ts'
import { popOf, populationCapacity } from './formulas.ts'
import type { GameState, Town, UnitCounts } from './types.ts'

/** Population is charged to the town that trained the unit, even while it is away. */
export function townPopulationUsed(town: Town, state: GameState): number {
  let pop = popOf(town.units)
  for (const job of Object.values(town.recruitQueues)) {
    if (job) pop += job.remaining * UNITS[job.unitId].pop
  }
  for (const movement of state.movements) {
    if (movement.originTownId === town.id && movement.ownerId === town.ownerId) {
      pop += popOf(movement.units)
    }
  }
  for (const other of state.towns) {
    for (const group of other.support) {
      if (group.originTownId === town.id && group.ownerId === town.ownerId) pop += popOf(group.units)
    }
  }
  for (const siege of state.sieges) {
    if (siege.originTownId === town.id && siege.attackerOwnerId === town.ownerId) pop += popOf(siege.units)
  }
  return pop
}

export function freePopulation(town: Town, state: GameState): number {
  return populationCapacity(town.buildings.farm) - townPopulationUsed(town, state)
}

export function popOfCount(unitId: keyof UnitCounts, count: number): number {
  return UNITS[unitId].pop * count
}

export function combatPop(units: UnitCounts): number {
  let n = 0
  for (const id of UNIT_IDS) n += units[id] ?? 0
  return n
}
