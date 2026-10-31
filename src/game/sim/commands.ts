import { RESOURCE_KEYS, UNIT_IDS, type BuildingId, type ResourceKey, type Resources } from '../config/ids.ts'
import { SIEGE, WORLD } from '../config/world.ts'
import { storageCapacity } from './formulas.ts'
import { distance, merchantTravelMs, normalizeOrder, travelMs } from './movement.ts'
import { hasUnits } from './defaults.ts'
import { findTown } from './buildings.ts'
import { payResources, syncTownResources } from './resources.ts'
import { siegeWeight } from './siege.ts'
import { considerAlertWake, currentScheduleNow, gameInstantToSchedule } from './schedule.ts'
import { makeRng } from './rng.ts'
import { emptyResources } from './defaults.ts'
import { nid, type GameState, type UnitCounts } from './types.ts'

function merchantsBusy(state: GameState, townId: string): number {
  let n = 0
  for (const movement of state.movements) {
    if (movement.mission === 'trade' && movement.originTownId === townId) n += movement.merchantCount
  }
  return n
}

export function sendArmy(
  state: GameState,
  fromId: string,
  toId: string,
  mission: 'attack' | 'siege' | 'relief' | 'support' | 'scout',
  requested: Partial<UnitCounts>,
  catapultTarget: BuildingId | null,
): string | null {
  const from = findTown(state, fromId)
  const to = findTown(state, toId)
  if (!from || !to) return 'That town is gone.'
  if (from.buildings.rally < 1) return 'Build a rally point before marching.'
  if (from.id === to.id) return 'Those troops are already home.'
  if ((mission === 'attack' || mission === 'siege') && from.ownerId === to.ownerId) return 'You cannot attack your own town.'
  if (mission === 'support' && from.ownerId !== to.ownerId) return 'Support can only reinforce your own towns.'
  if (mission === 'relief') {
    const siege = state.sieges.find((entry) => entry.townId === to.id)
    if (!siege) return 'That town is not under siege.'
    if (siege.attackerOwnerId === from.ownerId) return 'That camp is yours. March more troops as a siege to reinforce it.'
  }
  if (mission === 'siege') {
    const unitsPreview = normalizeOrder(requested)
    if (siegeWeight(unitsPreview) < SIEGE.minWeight) {
      return 'A siege needs a commander, or enough rams and catapults to invest the town.'
    }
  }
  const units = normalizeOrder(requested)
  if (mission === 'scout') {
    for (const id of UNIT_IDS) {
      if (id !== 'scout' && units[id] > 0) return 'A scouting party can only take scouts.'
    }
  }
  if (!hasUnits(units)) return 'Choose at least one unit.'
  for (const id of UNIT_IDS) {
    if (units[id] > from.units[id]) return 'You do not have that many troops at home.'
  }
  for (const id of UNIT_IDS) from.units[id] -= units[id]
  const dist = distance(from, to)
  const trip = travelMs(dist, units)
  state.movements.push({
    id: nid(state, 'm'),
    ownerId: from.ownerId,
    originTownId: from.id,
    targetTownId: to.id,
    mission,
    units,
    resources: emptyResources(),
    departsAt: state.gameTime,
    arrivesAt: state.gameTime + trip,
    travelMs: trip,
    catapultTarget: units.catapult > 0 ? (catapultTarget ?? 'wall') : null,
    tradeDelivered: false,
    returnsAt: null,
    merchantCount: 0,
  })
  if (mission === 'attack' || mission === 'siege') {
    const defender = state.owners.find((entry) => entry.id === to.ownerId)
    if (defender) {
      considerAlertWake(
        state,
        defender,
        gameInstantToSchedule(state, state.gameTime + trip, state.gameTime, currentScheduleNow(state)),
        makeRng(state),
      )
    }
  }
  return null
}

export function exchangeResources(
  state: GameState,
  townId: string,
  give: ResourceKey,
  receive: ResourceKey,
  amount: number,
): string | null {
  const town = findTown(state, townId)
  if (!town) return 'That town is gone.'
  if (town.buildings.market < 1) return 'Build a market first.'
  if (give === receive) return 'Choose two different resources.'
  const whole = Math.floor(amount)
  if (whole < WORLD.market.minShipment) return `Trade at least ${WORLD.market.minShipment}.`
  syncTownResources(town, state.gameTime, town.workPace > 1 ? SIEGE.productionFactor : 1)
  if (town.resources[give] + 1e-6 < whole) return 'Not enough to trade.'
  const gain = Math.floor(whole * (1 - WORLD.market.loss))
  if (gain <= 0) return 'That shipment is too small after the merchant’s cut.'
  town.resources[give] -= whole
  const cap = storageCapacity(town.buildings.warehouse)
  town.resources[receive] = Math.min(cap, town.resources[receive] + gain)
  return null
}

export function shipResources(
  state: GameState,
  fromId: string,
  toId: string,
  cargo: Resources,
): string | null {
  const from = findTown(state, fromId)
  const to = findTown(state, toId)
  if (!from || !to) return 'That town is gone.'
  if (from.id === to.id) return 'Those goods are already here.'
  if (from.ownerId !== to.ownerId) return 'Merchants only supply your own towns.'
  if (from.buildings.market < 1) return 'Build a market first.'
  const whole: Resources = {
    wood: Math.max(0, Math.floor(cargo.wood)),
    clay: Math.max(0, Math.floor(cargo.clay)),
    iron: Math.max(0, Math.floor(cargo.iron)),
  }
  const total = whole.wood + whole.clay + whole.iron
  if (total < WORLD.market.minShipment) return `Send at least ${WORLD.market.minShipment} goods.`
  syncTownResources(from, state.gameTime, from.workPace > 1 ? SIEGE.productionFactor : 1)
  for (const key of RESOURCE_KEYS) {
    if (from.resources[key] + 1e-6 < whole[key]) return 'Not enough in the warehouse.'
  }
  const need = Math.ceil(total / WORLD.market.carry)
  const free = from.buildings.market - merchantsBusy(state, from.id)
  if (need > free) return free <= 0 ? 'All of your merchants are on the road.' : `Only ${free} merchants are free.`
  payResources(from.resources, whole)
  const trip = merchantTravelMs(distance(from, to))
  state.movements.push({
    id: nid(state, 'm'),
    ownerId: from.ownerId,
    originTownId: from.id,
    targetTownId: to.id,
    mission: 'trade',
    units: normalizeOrder({}),
    resources: whole,
    departsAt: state.gameTime,
    arrivesAt: state.gameTime + trip,
    travelMs: trip,
    catapultTarget: null,
    tradeDelivered: false,
    returnsAt: state.gameTime + trip * 2,
    merchantCount: need,
  })
  return null
}
