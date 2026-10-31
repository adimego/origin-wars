import { SIEGE } from '../config/world.ts'
import { GAME_HOUR_MS } from './time.ts'
import type { Resources } from '../config/ids.ts'
import { RESOURCE_KEYS } from '../config/ids.ts'
import type { Town } from './types.ts'
import { storageCapacity, townProduction } from './formulas.ts'

export function syncTownResources(town: Town, gameTime: number, productionFactor = 1): void {
  if (gameTime <= town.resourcesAt) return
  const hours = (gameTime - town.resourcesAt) / GAME_HOUR_MS
  const rates = townProduction(town)
  const cap = storageCapacity(town.buildings.warehouse)
  const pace = productionFactor
  town.resources.wood = Math.min(cap, town.resources.wood + rates.wood * hours * pace)
  town.resources.clay = Math.min(cap, town.resources.clay + rates.clay * hours * pace)
  town.resources.iron = Math.min(cap, town.resources.iron + rates.iron * hours * pace)
  town.resourcesAt = gameTime
}

export function syncAllResources(state: { towns: Town[]; sieges: { townId: string }[] }, gameTime: number): void {
  for (const town of state.towns) {
    const besieged = state.sieges.some((siege) => siege.townId === town.id)
    syncTownResources(town, gameTime, besieged ? SIEGE.productionFactor : 1)
  }
}

export function payResources(stock: Resources, cost: Resources): void {
  stock.wood -= cost.wood
  stock.clay -= cost.clay
  stock.iron -= cost.iron
}

export function grantResources(town: Town, gift: Resources): Resources {
  const cap = storageCapacity(town.buildings.warehouse)
  const spilled = { wood: 0, clay: 0, iron: 0 }
  for (const key of RESOURCE_KEYS) {
    const room = Math.max(0, cap - town.resources[key])
    const take = Math.min(room, gift[key])
    spilled[key] = gift[key] - take
    town.resources[key] += take
  }
  return spilled
}

export function floorResources(stock: Resources): Resources {
  return {
    wood: Math.floor(stock.wood),
    clay: Math.floor(stock.clay),
    iron: Math.floor(stock.iron),
  }
}
