import { BUILDINGS } from '../config/buildings.ts'
import { UNIT_IDS, type BuildingId } from '../config/ids.ts'
import { COMBAT, SIEGE, WORLD } from '../config/world.ts'
import { botLogin, executeBotOrder } from './ai.ts'
import { completeBuild, findTown } from './buildings.ts'
import { distributeLosses, resolveCombat, resolveScout } from './combat.ts'
import { addUnits, cloneUnits, emptyRecruitQueues, emptyResources, emptyUnits, hasUnits } from './defaults.ts'
import { storageCapacity, townPoints } from './formulas.ts'
import { distance, travelMs } from './movement.ts'
import { makeRng } from './rng.ts'
import { habitBlurb } from './schedule.ts'
import { canInvest, durationForTown, holdsCamp, productionFactorFor, siegeOn, stretchLabor } from './siege.ts'
import { completeRecruit, completeResearch } from './recruit.ts'
import { floorResources, grantResources, syncAllResources, syncTownResources } from './resources.ts'
import {
  nid,
  type BattleView,
  type GameState,
  type Movement,
  type Owner,
  type Report,
  type Siege,
  type Town,
  type UnitCounts,
  type UnitLine,
} from './types.ts'

export function projectGameTime(state: GameState, realNow: number): number {
  const elapsed = Math.max(0, realNow - state.lastRealMs)
  return state.gameTime + elapsed * state.speed
}

export function advance(state: GameState, realNow: number): GameState {
  const elapsed = Math.max(0, realNow - state.lastRealMs)
  const target = Math.round(state.gameTime + elapsed * state.speed)
  const draft = structuredClone(state)
  simulate(draft, Math.max(draft.gameTime, target))
  draft.lastRealMs = realNow
  return draft
}

export function act(
  state: GameState,
  realNow: number,
  fn: (draft: GameState) => string | null,
): { state: GameState; error: string | null } {
  const synced = advance(state, realNow)
  const draft = structuredClone(synced)
  const error = fn(draft)
  return error ? { state: synced, error } : { state: draft, error: null }
}

export function setWorldSpeed(state: GameState, speed: number, realNow: number): GameState {
  const synced = advance(state, realNow)
  const next = Math.max(1, Math.min(500, speed))
  if (next === synced.speed) return synced
  return { ...synced, speed: next }
}

function ownerById(state: GameState, id: string): Owner | undefined {
  return state.owners.find((owner) => owner.id === id)
}

function lordName(state: GameState, ownerId: string): string {
  const owner = ownerById(state, ownerId)
  if (!owner || owner.kind === 'barbarian') return 'Abandoned'
  if (owner.kind === 'player') return owner.name || 'You'
  return owner.name
}

function unitLines(sent: UnitCounts, losses: UnitCounts): UnitLine[] {
  return UNIT_IDS.filter((id) => (sent[id] ?? 0) > 0).map((id) => ({
    id,
    sent: sent[id] ?? 0,
    lost: losses[id] ?? 0,
  }))
}

function pushReport(state: GameState, report: Report): void {
  const owner = ownerById(state, report.ownerId)
  if (!owner || owner.kind === 'barbarian') return
  state.reports.unshift(report)
}

function trimReports(state: GameState): void {
  if (state.reports.length <= WORLD.reportCap + 30) return
  const unread = new Set(
    state.reports.filter((report) => report.ownerId === state.playerId && report.unread).map((report) => report.id),
  )
  const sorted = [...state.reports].sort((a, b) => b.at - a.at)
  const next: Report[] = []
  for (const report of sorted) {
    if (next.length < WORLD.reportCap || unread.has(report.id)) next.push(report)
  }
  state.reports = next
}

function ensurePlayer(state: GameState): void {
  const owned = state.towns.filter((town) => town.ownerId === state.playerId)
  state.defeated = owned.length === 0
  if (!owned.some((town) => town.id === state.selectedTownId) && owned[0]) state.selectedTownId = owned[0].id
}

function removeMovement(state: GameState, id: string): void {
  const index = state.movements.findIndex((movement) => movement.id === id)
  if (index >= 0) state.movements.splice(index, 1)
}

function sendHome(
  state: GameState,
  ownerId: string,
  originId: string,
  from: Town,
  units: UnitCounts,
  loot: { wood: number; clay: number; iron: number },
  now: number,
): void {
  if (!hasUnits(units) && loot.wood + loot.clay + loot.iron <= 0) return
  const origin = findTown(state, originId)
  if (!origin) return
  const trip = hasUnits(units) ? travelMs(distance(from, origin), units) : Math.max(WORLD.minActionMs, travelMs(distance(from, origin), units))
  state.movements.push({
    id: nid(state, 'm'),
    ownerId,
    originTownId: originId,
    targetTownId: originId,
    mission: 'return',
    units: cloneUnits(units),
    resources: { ...loot },
    departsAt: now,
    arrivesAt: now + (hasUnits(units) ? trip : Math.max(WORLD.minActionMs, Math.round(distance(from, origin) * WORLD.minutesPerField * 60_000))),
    travelMs: trip,
    catapultTarget: null,
    tradeDelivered: false,
    returnsAt: null,
    merchantCount: 0,
  })
}

function combine(groups: UnitCounts[]): UnitCounts {
  const total = cloneUnits(groups[0] ?? emptyUnits())
  for (let i = 1; i < groups.length; i++) addUnits(total, groups[i])
  return total
}

function clampStores(town: Town): void {
  const cap = storageCapacity(town.buildings.warehouse)
  town.resources.wood = Math.min(town.resources.wood, cap)
  town.resources.clay = Math.min(town.resources.clay, cap)
  town.resources.iron = Math.min(town.resources.iron, cap)
  if (town.buildings.barracks <= 0) town.recruitQueues.barracks = null
  if (town.buildings.stable <= 0) town.recruitQueues.stable = null
  if (town.buildings.workshop <= 0) town.recruitQueues.workshop = null
  if (town.buildings.academy <= 0) town.recruitQueues.academy = null
  if (town.buildings.headquarters < 1) town.buildings.headquarters = 1
}

function syncTown(state: GameState, town: Town, now: number): void {
  syncTownResources(town, now, productionFactorFor(state, town.id))
}

function liftSiege(state: GameState, siege: Siege, now: number, remnants: UnitCounts | null): void {
  const town = findTown(state, siege.townId)
  if (town) town.workPace = 1
  if (town && remnants && hasUnits(remnants)) {
    sendHome(state, siege.attackerOwnerId, siege.originTownId, town, remnants, emptyResources(), now)
  }
  state.sieges = state.sieges.filter((entry) => entry.id !== siege.id)
  state.aidCalls = state.aidCalls.filter((call) => call.townId !== siege.townId)
}

function openSiege(state: GameState, town: Town, ownerId: string, originTownId: string, units: UnitCounts, now: number): Siege {
  const weight = units.ram * SIEGE.weight.ram + units.catapult * SIEGE.weight.catapult + units.commander * SIEGE.weight.commander
  const siege: Siege = {
    id: nid(state, 'sg'),
    townId: town.id,
    attackerOwnerId: ownerId,
    originTownId,
    units: cloneUnits(units),
    startedAt: now,
    endsAt: now + durationForTown(town, weight),
  }
  town.workPace = SIEGE.laborFactor
  stretchLabor(town, now)
  state.sieges.push(siege)
  const origin = findTown(state, originTownId)
  const summary = `${origin?.name ?? 'An army'} has invested ${town.name}. The fields slow, and the camp holds until the clock runs out.`
  for (const owner of [ownerId, town.ownerId]) {
    pushReport(state, {
      id: nid(state, 'r'),
      ownerId: owner,
      at: now,
      unread: true,
      kind: 'siege',
      title: owner === ownerId ? `Siege of ${town.name}` : `${town.name} is under siege`,
      summary,
      townId: town.id,
      siegeEndsAt: siege.endsAt,
    })
  }
  return siege
}

function captureTown(state: GameState, siege: Siege, now: number): void {
  const town = findTown(state, siege.townId)
  if (!town) {
    state.sieges = state.sieges.filter((entry) => entry.id !== siege.id)
    return
  }
  if (!holdsCamp(siege.units)) {
    const remnants = cloneUnits(siege.units)
    liftSiege(state, siege, now, remnants)
    pushReport(state, {
      id: nid(state, 'r'),
      ownerId: siege.attackerOwnerId,
      at: now,
      unread: true,
      kind: 'siege',
      title: `Siege of ${town.name} abandoned`,
      summary: 'Too few soldiers were left to keep the camp.',
      townId: town.id,
      siegeEndsAt: null,
    })
    return
  }
  syncTown(state, town, now)
  for (const group of [...town.support]) {
    sendHome(state, group.ownerId, group.originTownId, town, group.units, emptyResources(), now)
  }
  const previous = town.ownerId
  town.ownerId = siege.attackerOwnerId
  town.units = cloneUnits(siege.units)
  town.support = []
  town.buildQueue = []
  town.recruitQueues = emptyRecruitQueues()
  town.researchJob = null
  town.workPace = 1
  state.sieges = state.sieges.filter((entry) => entry.id !== siege.id)
  state.aidCalls = state.aidCalls.filter((call) => call.townId !== town.id)
  pushReport(state, {
    id: nid(state, 'r'),
    ownerId: siege.attackerOwnerId,
    at: now,
    unread: true,
    kind: 'siege',
    title: `${town.name} is taken`,
    summary: `The siege held. ${town.name} surrendered with its stores and walls.`,
    townId: town.id,
    siegeEndsAt: null,
  })
  pushReport(state, {
    id: nid(state, 'r'),
    ownerId: previous,
    at: now,
    unread: true,
    kind: 'siege',
    title: `${town.name} fell`,
    summary: `${lordName(state, siege.attackerOwnerId)} now holds ${town.name}.`,
    townId: town.id,
    siegeEndsAt: null,
  })
}

function fightCamp(
  state: GameState,
  siege: Siege,
  attackers: UnitCounts,
  attackerResearch: Town['research'],
  now: number,
): { attackerWins: boolean; attackerRemaining: UnitCounts; attackerLosses: UnitCounts; defenderLosses: UnitCounts; defenderSent: UnitCounts; luck: number } {
  const town = findTown(state, siege.townId)
  const rng = makeRng(state)
  const luck = (rng() * 2 - 1) * COMBAT.luckRange
  const defenderSent = cloneUnits(siege.units)
  const result = resolveCombat({
    attackers: { units: attackers, research: attackerResearch },
    defenders: { units: siege.units, research: {} },
    wall: 0,
    buildings: town?.buildings ?? ({} as Town['buildings']),
    resources: emptyResources(),
    luck,
    catapultTarget: null,
  })
  siege.units = result.defenderRemaining
  if (!holdsCamp(siege.units)) {
    const remnants = cloneUnits(siege.units)
    const brokenOwner = siege.attackerOwnerId
    const townId = siege.townId
    liftSiege(state, siege, now, hasUnits(remnants) ? remnants : null)
    const place = findTown(state, townId)
    const summary = 'The camp could not hold.'
    pushReport(state, {
      id: nid(state, 'r'),
      ownerId: brokenOwner,
      at: now,
      unread: true,
      kind: 'siege',
      title: `Siege of ${place?.name ?? 'the town'} is broken`,
      summary,
      townId,
      siegeEndsAt: null,
    })
    if (place && place.ownerId !== brokenOwner) {
      pushReport(state, {
        id: nid(state, 'r'),
        ownerId: place.ownerId,
        at: now,
        unread: true,
        kind: 'siege',
        title: `Siege of ${place.name} is broken`,
        summary: 'The besiegers have been driven off.',
        townId,
        siegeEndsAt: null,
      })
    }
  }
  return {
    attackerWins: result.attackerWins,
    attackerRemaining: result.attackerRemaining,
    attackerLosses: result.attackerLosses,
    defenderLosses: result.defenderLosses,
    defenderSent,
    luck,
  }
}

function battleFrom(
  state: GameState,
  movement: Movement,
  origin: Town,
  target: Town,
  sent: UnitCounts,
  fought: { attackerWins: boolean; attackerLosses: UnitCounts; defenderLosses: UnitCounts; defenderSent?: UnitCounts; luck: number },
  invested: boolean,
  siegeEndsAt: number | null,
): BattleView {
  return {
    attackerName: lordName(state, movement.ownerId),
    defenderName: lordName(state, target.ownerId),
    attackerTown: origin.name,
    defenderTown: target.name,
    fromX: origin.x,
    fromY: origin.y,
    toX: target.x,
    toY: target.y,
    luck: fought.luck,
    attackerWins: fought.attackerWins,
    attackerUnits: unitLines(sent, fought.attackerLosses),
    defenderUnits: unitLines(fought.defenderSent ?? emptyUnits(), fought.defenderLosses),
    loot: emptyResources(),
    wallBefore: 0,
    wallAfter: 0,
    buildingTarget: null,
    buildingBefore: 0,
    buildingAfter: 0,
    invested,
    siegeEndsAt,
  }
}

function arrive(state: GameState, movement: Movement): void {
  const now = state.gameTime
  if (movement.mission === 'return') {
    const home = findTown(state, movement.originTownId)
    if (home && home.ownerId === movement.ownerId) {
      syncTown(state, home, now)
      addUnits(home.units, movement.units)
      const spilled = grantResources(home, movement.resources)
      const hauled = movement.resources.wood + movement.resources.clay + movement.resources.iron
      pushReport(state, {
        id: nid(state, 'r'),
        ownerId: movement.ownerId,
        at: now,
        unread: true,
        kind: 'return',
        title: `Troops back in ${home.name}`,
        summary:
          hauled > 0
            ? `They brought ${Math.floor(movement.resources.wood)} wood, ${Math.floor(movement.resources.clay)} clay, and ${Math.floor(movement.resources.iron)} iron.${spilled.wood + spilled.clay + spilled.iron > 0 ? ' The warehouse spilled some of it.' : ''}`
            : 'The column is home. The carts were empty.',
        townId: home.id,
      })
    } else {
      pushReport(state, {
        id: nid(state, 'r'),
        ownerId: movement.ownerId,
        at: now,
        unread: true,
        kind: 'return',
        title: 'The gates were barred',
        summary: 'Returning troops found their town in other hands. The column scattered.',
        townId: movement.originTownId,
      })
    }
    removeMovement(state, movement.id)
    return
  }

  if (movement.mission === 'trade') {
    const target = findTown(state, movement.targetTownId)
    if (!movement.tradeDelivered) {
      if (target && target.ownerId === movement.ownerId) {
        syncTown(state, target, now)
        const spilled = grantResources(target, movement.resources)
        pushReport(state, {
          id: nid(state, 'r'),
          ownerId: movement.ownerId,
          at: now,
          unread: true,
          kind: 'trade',
          title: `Goods delivered to ${target.name}`,
          summary: 'The merchants are turning around.',
          townId: target.id,
          trade: { delivered: { ...movement.resources }, spilled, targetName: target.name },
        })
        movement.resources = emptyResources()
        movement.tradeDelivered = true
      } else {
        movement.mission = 'return'
        movement.targetTownId = movement.originTownId
        movement.arrivesAt = now + movement.travelMs
        movement.tradeDelivered = false
        pushReport(state, {
          id: nid(state, 'r'),
          ownerId: movement.ownerId,
          at: now,
          unread: true,
          kind: 'trade',
          title: 'Merchants turned back',
          summary: 'The destination no longer answers to you. The goods are coming home.',
          townId: movement.originTownId,
        })
      }
      return
    }
    removeMovement(state, movement.id)
    return
  }

  const target = findTown(state, movement.targetTownId)
  const origin = findTown(state, movement.originTownId)
  if (!target || !origin) {
    removeMovement(state, movement.id)
    return
  }

  const siege = siegeOn(state, target.id)

  if (movement.mission === 'support' || movement.mission === 'relief') {
    if (siege && movement.ownerId === siege.attackerOwnerId) {
      addUnits(siege.units, movement.units)
      pushReport(state, {
        id: nid(state, 'r'),
        ownerId: movement.ownerId,
        at: now,
        unread: true,
        kind: 'siege',
        title: `Reinforcements join the siege of ${target.name}`,
        summary: `Troops from ${origin.name} marched into the camp.`,
        townId: target.id,
        siegeEndsAt: siege.endsAt,
      })
      removeMovement(state, movement.id)
      return
    }
    if (siege && (movement.mission === 'relief' || movement.ownerId === target.ownerId)) {
      const fought = fightCamp(state, siege, movement.units, origin.research, now)
      pushReport(state, {
        id: nid(state, 'r'),
        ownerId: movement.ownerId,
        at: now,
        unread: true,
        kind: 'battle',
        title: fought.attackerWins ? `Relief reached ${target.name}` : `Relief failed at ${target.name}`,
        summary: fought.attackerWins
          ? 'The camp was driven off.'
          : 'The besiegers held the field. Survivors are falling back.',
        townId: target.id,
        battle: battleFrom(state, movement, origin, target, movement.units, fought, false, null),
      })
      if (hasUnits(fought.attackerRemaining)) {
        if (movement.ownerId === target.ownerId && target.ownerId !== 'wild') addUnits(target.units, fought.attackerRemaining)
        else sendHome(state, movement.ownerId, movement.originTownId, target, fought.attackerRemaining, emptyResources(), now)
      }
      removeMovement(state, movement.id)
      return
    }
    if (movement.mission === 'relief') {
      sendHome(state, movement.ownerId, movement.originTownId, target, movement.units, emptyResources(), now)
      pushReport(state, {
        id: nid(state, 'r'),
        ownerId: movement.ownerId,
        at: now,
        unread: true,
        kind: 'siege',
        title: `No siege at ${target.name}`,
        summary: 'The camp was gone before your troops arrived. They are marching home.',
        townId: target.id,
        siegeEndsAt: null,
      })
      removeMovement(state, movement.id)
      return
    }
    if (target.ownerId !== movement.ownerId) {
      sendHome(state, movement.ownerId, movement.originTownId, target, movement.units, emptyResources(), now)
      pushReport(state, {
        id: nid(state, 'r'),
        ownerId: movement.ownerId,
        at: now,
        unread: true,
        kind: 'support',
        title: `Support bounced from ${target.name}`,
        summary: 'The town changed hands before your troops arrived. They are marching home.',
        townId: target.id,
      })
    } else {
      target.support.push({
        id: nid(state, 's'),
        ownerId: movement.ownerId,
        originTownId: movement.originTownId,
        units: cloneUnits(movement.units),
      })
      pushReport(state, {
        id: nid(state, 'r'),
        ownerId: movement.ownerId,
        at: now,
        unread: true,
        kind: 'support',
        title: `Support holding ${target.name}`,
        summary: `Troops from ${origin.name} are standing on the wall.`,
        townId: target.id,
      })
    }
    removeMovement(state, movement.id)
    return
  }

  syncTown(state, target, now)
  const groups = [cloneUnits(target.units), ...target.support.map((group) => cloneUnits(group.units))]
  const defenders = combine(groups)

  if (movement.mission === 'scout') {
    const result = resolveScout({
      attackers: { units: movement.units, research: origin.research },
      defenders: { units: defenders, research: target.research },
    })
    const owner = ownerById(state, target.ownerId)
    const habit = result.revealed === 'full' && owner?.schedule ? habitBlurb(owner.schedule) : null
    const camp = siegeOn(state, target.id)
    const scout = {
      success: result.success,
      townId: target.id,
      townName: target.name,
      ownerName: lordName(state, target.ownerId),
      x: target.x,
      y: target.y,
      resources: result.revealed === 'none' ? null : floorResources(target.resources),
      buildings: result.revealed === 'none' ? null : { ...target.buildings },
      units: result.revealed === 'full' ? cloneUnits(defenders) : null,
      habit,
      points: result.revealed === 'none' ? null : townPoints(target),
    }
    pushReport(state, {
      id: nid(state, 'r'),
      ownerId: movement.ownerId,
      at: now,
      unread: true,
      kind: 'scout',
      title: result.success ? `Scout of ${target.name}` : `Scouts lost at ${target.name}`,
      summary: result.success
        ? result.revealed === 'full'
          ? `A full picture: stores, buildings, and the garrison.${camp ? ' A siege camp is outside the walls.' : ''}`
          : 'A partial look. Stores and buildings, but the garrison stayed hidden.'
        : 'The scouts were caught. You learned nothing.',
      townId: target.id,
      scout,
    })
    pushReport(state, {
      id: nid(state, 'r'),
      ownerId: target.ownerId,
      at: now,
      unread: true,
      kind: 'scout',
      title: result.success ? `Scouts slipped into ${target.name}` : `Scouts caught at ${target.name}`,
      summary: result.success ? 'Someone has seen the inside of this town.' : 'Foreign scouts were cut down outside the gate.',
      townId: target.id,
    })
    if (hasUnits(result.attackerRemaining)) {
      sendHome(state, movement.ownerId, movement.originTownId, target, result.attackerRemaining, emptyResources(), now)
    }
    removeMovement(state, movement.id)
    return
  }

  if (siege && (movement.mission === 'attack' || movement.mission === 'siege')) {
    if (movement.ownerId === siege.attackerOwnerId) {
      addUnits(siege.units, movement.units)
      pushReport(state, {
        id: nid(state, 'r'),
        ownerId: movement.ownerId,
        at: now,
        unread: true,
        kind: 'siege',
        title: `The siege of ${target.name} is reinforced`,
        summary: 'More troops walked into the camp.',
        townId: target.id,
        siegeEndsAt: siege.endsAt,
      })
      removeMovement(state, movement.id)
      return
    }
    const fought = fightCamp(state, siege, movement.units, origin.research, now)
    const campGone = !siegeOn(state, target.id)
    if (campGone && movement.mission === 'siege' && fought.attackerWins && canInvest(fought.attackerRemaining)) {
      openSiege(state, target, movement.ownerId, movement.originTownId, fought.attackerRemaining, now)
    } else if (hasUnits(fought.attackerRemaining)) {
      sendHome(state, movement.ownerId, movement.originTownId, target, fought.attackerRemaining, emptyResources(), now)
    }
    removeMovement(state, movement.id)
    return
  }

  const rng = makeRng(state)
  const luck = (rng() * 2 - 1) * COMBAT.luckRange
  const sent = cloneUnits(movement.units)
  const result = resolveCombat({
    attackers: { units: movement.units, research: origin.research },
    defenders: { units: defenders, research: target.research },
    wall: target.buildings.wall,
    buildings: target.buildings,
    resources: target.resources,
    luck,
    catapultTarget: movement.catapultTarget,
  })
  const remainGroups = distributeLosses(groups, result.defenderLosses)
  target.units = remainGroups[0] ?? emptyUnits()
  target.support = target.support
    .map((group, index) => ({ ...group, units: remainGroups[index + 1] ?? group.units }))
    .filter((group) => hasUnits(group.units))
  target.buildings.wall = result.wallAfter
  if (result.buildingTarget && result.buildingTarget !== 'wall') {
    target.buildings[result.buildingTarget] = result.buildingAfter
  }
  clampStores(target)

  const investing = result.attackerWins && movement.mission === 'siege' && canInvest(result.attackerRemaining)
  if (result.attackerWins && !investing) {
    target.resources.wood = Math.max(0, target.resources.wood - result.loot.wood)
    target.resources.clay = Math.max(0, target.resources.clay - result.loot.clay)
    target.resources.iron = Math.max(0, target.resources.iron - result.loot.iron)
  }

  let siegeEndsAt: number | null = null
  if (investing) {
    const opened = openSiege(state, target, movement.ownerId, movement.originTownId, result.attackerRemaining, now)
    siegeEndsAt = opened.endsAt
  }
  const battle = battleFrom(state, movement, origin, target, sent, {
    attackerWins: result.attackerWins,
    attackerLosses: result.attackerLosses,
    defenderLosses: result.defenderLosses,
    defenderSent: defenders,
    luck,
  }, investing, siegeEndsAt)
  battle.loot = investing ? emptyResources() : result.loot
  battle.wallBefore = result.wallBefore
  battle.wallAfter = result.wallAfter
  battle.buildingTarget = result.buildingTarget
  battle.buildingBefore = result.buildingBefore
  battle.buildingAfter = result.buildingAfter

  const winner = result.attackerWins ? battle.attackerName : battle.defenderName
  const summary = investing
    ? `${winner} beat the garrison and invested ${target.name}. The siege will hold if the camp is not broken.`
    : result.attackerWins
      ? movement.mission === 'siege'
        ? `${winner} won, but the column was too light to invest ${target.name}. They carried off what they could.`
        : `${winner} carried off ${result.loot.wood} wood, ${result.loot.clay} clay, and ${result.loot.iron} iron.`
      : `${winner} held ${target.name}. The attackers were beaten.`
  pushReport(state, {
    id: nid(state, 'r'),
    ownerId: movement.ownerId,
    at: now,
    unread: true,
    kind: 'battle',
    title: result.attackerWins ? `Victory at ${target.name}` : `Defeat at ${target.name}`,
    summary,
    townId: target.id,
    battle,
  })
  pushReport(state, {
    id: nid(state, 'r'),
    ownerId: target.ownerId,
    at: now,
    unread: true,
    kind: 'battle',
    title: investing ? `${target.name} is invested` : result.attackerWins ? `${target.name} was raided` : `${target.name} held`,
    summary,
    townId: target.id,
    battle,
  })
  if (!investing && hasUnits(result.attackerRemaining)) {
    sendHome(state, movement.ownerId, movement.originTownId, target, result.attackerRemaining, result.attackerWins ? result.loot : emptyResources(), now)
  }

  removeMovement(state, movement.id)
}
interface SimEvent {
  t: number
  prio: number
  key: string
  run: () => void
  discard: () => void
}

function nextEvent(state: GameState): SimEvent | null {
  let best: SimEvent | null = null
  const consider = (event: SimEvent) => {
    if (!best || event.t < best.t || (event.t === best.t && event.prio < best.prio)) best = event
  }
  for (const town of state.towns) {
    const build = town.buildQueue[0]
    if (build?.completesAt != null) {
      const townId = town.id
      consider({
        t: build.completesAt,
        prio: 1,
        key: `build:${townId}`,
        run: () => {
          const current = findTown(state, townId)
          if (current) completeBuild(current, state.gameTime)
        },
        discard: () => {
          const current = findTown(state, townId)
          if (current?.buildQueue[0]) current.buildQueue.shift()
        },
      })
    }
    if (town.researchJob) {
      const townId = town.id
      const at = town.researchJob.completesAt
      consider({
        t: at,
        prio: 1,
        key: `research:${townId}`,
        run: () => {
          const current = findTown(state, townId)
          if (current) completeResearch(current, state.gameTime)
        },
        discard: () => {
          const current = findTown(state, townId)
          if (current) current.researchJob = null
        },
      })
    }
    for (const building of ['barracks', 'stable', 'workshop', 'academy'] as const) {
      const job = town.recruitQueues[building]
      if (!job) continue
      const townId = town.id
      consider({
        t: job.nextAt,
        prio: 1,
        key: `recruit:${townId}:${building}`,
        run: () => {
          const current = findTown(state, townId)
          if (current) completeRecruit(current, building, state.gameTime)
        },
        discard: () => {
          const current = findTown(state, townId)
          if (current) current.recruitQueues[building] = null
        },
      })
    }
  }
  for (const movement of state.movements) {
    const id = movement.id
    const tradeReturn = movement.mission === 'trade' && movement.tradeDelivered && movement.returnsAt != null
    consider({
      t: tradeReturn ? movement.returnsAt! : movement.arrivesAt,
      prio: 0,
      key: `move:${id}:${tradeReturn ? 'back' : 'go'}`,
      run: () => {
        const current = state.movements.find((entry) => entry.id === id)
        if (current) arrive(state, current)
      },
      discard: () => removeMovement(state, id),
    })
  }
  for (const owner of state.owners) {
    if (owner.orders[0]) {
      const order = owner.orders[0]
      const ownerId = owner.id
      consider({
        t: order.at,
        prio: 2,
        key: `order:${order.id}`,
        run: () => {
          const current = ownerById(state, ownerId)
          const next = current?.orders[0]
          if (!current || !next) return
          current.orders.shift()
          if (next.type === 'sally') sally(state, next.townId)
          else if (next.type === 'aid') callForAid(state, next.townId)
          else executeBotOrder(state, current, next)
        },
        discard: () => {
          const current = ownerById(state, ownerId)
          current?.orders.shift()
        },
      })
    }
    if (owner.kind === 'bot' && owner.nextLoginAt != null) {
      const ownerId = owner.id
      const at = owner.nextLoginAt
      consider({
        t: at,
        prio: 3,
        key: `login:${ownerId}:${at}`,
        run: () => {
          const current = ownerById(state, ownerId)
          if (current) botLogin(state, current)
        },
        discard: () => {
          const current = ownerById(state, ownerId)
          if (current) current.nextLoginAt = state.gameTime + 60 * 60_000
        },
      })
    }
  }
  for (const siege of state.sieges) {
    const siegeId = siege.id
    consider({
      t: siege.endsAt,
      prio: 1,
      key: `siege:${siegeId}`,
      run: () => {
        const current = state.sieges.find((entry) => entry.id === siegeId)
        if (current) captureTown(state, current, state.gameTime)
      },
      discard: () => {
        state.sieges = state.sieges.filter((entry) => entry.id !== siegeId)
      },
    })
  }
  return best
}

function simulate(state: GameState, target: number): void {
  let guard = 0
  let lastStamp = ''
  let spins = 0
  while (guard < 400_000) {
    guard += 1
    const event = nextEvent(state)
    if (!event || event.t > target) break
    const stamp = `${event.key}@${event.t}`
    if (stamp === lastStamp) {
      spins += 1
      if (spins > 4) {
        event.discard()
        spins = 0
        lastStamp = ''
        continue
      }
    } else {
      spins = 0
      lastStamp = stamp
    }
    state.gameTime = Math.max(state.gameTime, event.t)
    event.run()
  }
  state.gameTime = target
  syncAllResources(state, target)
  state.aidCalls = state.aidCalls.filter((call) => call.expiresAt > target)
  ensurePlayer(state)
  trimReports(state)
}

export function summarizeOffline(before: GameState, after: GameState): string[] {
  const lines: string[] = []
  const beforeTowns = before.towns.filter((town) => town.ownerId === before.playerId)
  const afterTowns = after.towns.filter((town) => town.ownerId === after.playerId)
  if (afterTowns.length > beforeTowns.length) {
    lines.push(`You took ${afterTowns.length - beforeTowns.length} town${afterTowns.length - beforeTowns.length === 1 ? '' : 's'}.`)
  }
  if (afterTowns.length < beforeTowns.length) {
    lines.push(`You lost ${beforeTowns.length - afterTowns.length} town${beforeTowns.length - afterTowns.length === 1 ? '' : 's'}.`)
  }
  let upgrades = 0
  for (const town of afterTowns) {
    const prev = beforeTowns.find((entry) => entry.id === town.id)
    if (!prev) continue
    for (const id of Object.keys(town.buildings) as BuildingId[]) {
      if (town.buildings[id] > prev.buildings[id]) upgrades += town.buildings[id] - prev.buildings[id]
    }
  }
  if (upgrades > 0) lines.push(`${upgrades} building level${upgrades === 1 ? '' : 's'} finished.`)
  const beforeReports = before.reports.filter((report) => report.ownerId === before.playerId).length
  const afterReports = after.reports.filter((report) => report.ownerId === after.playerId).length
  const fresh = afterReports - beforeReports
  if (fresh > 0) lines.push(`${fresh} new report${fresh === 1 ? '' : 's'}.`)
  return lines
}

export function buildingLabel(id: BuildingId): string {
  return BUILDINGS[id].name
}

export function sally(state: GameState, townId: string): string | null {
  const town = findTown(state, townId)
  const siege = siegeOn(state, townId)
  if (!town || !siege) return 'There is no siege to sally against.'
  if (!hasUnits(town.units)) return 'The garrison is empty.'
  const sent = cloneUnits(town.units)
  town.units = emptyUnits()
  const fought = fightCamp(state, siege, sent, town.research, state.gameTime)
  if (hasUnits(fought.attackerRemaining)) addUnits(town.units, fought.attackerRemaining)
  return null
}

export function withdrawSiege(state: GameState, siegeId: string): string | null {
  const siege = state.sieges.find((entry) => entry.id === siegeId)
  if (!siege) return 'That siege is already over.'
  const town = findTown(state, siege.townId)
  const units = cloneUnits(siege.units)
  liftSiege(state, siege, state.gameTime, null)
  if (town && hasUnits(units)) sendHome(state, siege.attackerOwnerId, siege.originTownId, town, units, emptyResources(), state.gameTime)
  if (town) {
    pushReport(state, {
      id: nid(state, 'r'),
      ownerId: siege.attackerOwnerId,
      at: state.gameTime,
      unread: true,
      kind: 'siege',
      title: `Siege of ${town.name} lifted`,
      summary: 'The camp packed up and marched home.',
      townId: town.id,
      siegeEndsAt: null,
    })
    pushReport(state, {
      id: nid(state, 'r'),
      ownerId: town.ownerId,
      at: state.gameTime,
      unread: true,
      kind: 'siege',
      title: `The siege of ${town.name} lifted`,
      summary: 'The besiegers marched away.',
      townId: town.id,
      siegeEndsAt: null,
    })
  }
  return null
}

export function callForAid(state: GameState, townId: string): string | null {
  const town = findTown(state, townId)
  const siege = siegeOn(state, townId)
  if (!town || !siege) return 'There is no siege to call aid for.'
  if (siege.attackerOwnerId === town.ownerId) return 'That camp is yours.'
  if (state.aidCalls.some((call) => call.townId === townId && call.expiresAt > state.gameTime)) {
    return 'Riders are already looking for help.'
  }
  state.aidCalls.push({
    id: nid(state, 'aid'),
    townId,
    ownerId: town.ownerId,
    askedAt: state.gameTime,
    expiresAt: siege.endsAt,
  })
  pushReport(state, {
    id: nid(state, 'r'),
    ownerId: town.ownerId,
    at: state.gameTime,
    unread: true,
    kind: 'siege',
    title: `Aid requested for ${town.name}`,
    summary: 'Nearby lords hear of it when they next sit down. An asleep neighbor answers late, or not at all.',
    townId,
    siegeEndsAt: siege.endsAt,
  })
  return null
}
