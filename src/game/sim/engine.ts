import { BUILDINGS } from '../config/buildings.ts'
import { UNIT_IDS, type BuildingId } from '../config/ids.ts'
import { COMBAT, WORLD } from '../config/world.ts'
import { botLogin, executeBotOrder } from './ai.ts'
import { completeBuild, findTown } from './buildings.ts'
import { distributeLosses, resolveCombat, resolveScout } from './combat.ts'
import { applyNobleImpact, loyaltyAt, rollLoyaltyDrop } from './conquest.ts'
import { addUnits, cloneUnits, emptyRecruitQueues, emptyResources, hasUnits } from './defaults.ts'
import { storageCapacity, townPoints } from './formulas.ts'
import { distance, travelMs } from './movement.ts'
import { makeRng } from './rng.ts'
import { habitBlurb } from './schedule.ts'
import { completeRecruit, completeResearch } from './recruit.ts'
import { floorResources, grantResources, syncAllResources, syncTownResources } from './resources.ts'
import {
  nid,
  type BattleView,
  type GameState,
  type Movement,
  type Owner,
  type Report,
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
  const total = cloneUnits(groups[0] ?? { spear: 0, sword: 0, axe: 0, scout: 0, light: 0, heavy: 0, ram: 0, catapult: 0, noble: 0 })
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

function arrive(state: GameState, movement: Movement): void {
  const now = state.gameTime
  if (movement.mission === 'return') {
    const home = findTown(state, movement.originTownId)
    if (home && home.ownerId === movement.ownerId) {
      syncTownResources(home, now)
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
        syncTownResources(target, now)
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

  if (movement.mission === 'support') {
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

  syncTownResources(target, now)
  const loyaltyBefore = loyaltyAt(target.loyalty, target.loyaltyAt, now)
  target.loyalty = loyaltyBefore
  target.loyaltyAt = now
  const groups = [cloneUnits(target.units), ...target.support.map((group) => cloneUnits(group.units))]
  const defenders = combine(groups)

  if (movement.mission === 'scout') {
    const result = resolveScout({
      attackers: { units: movement.units, research: origin.research },
      defenders: { units: defenders, research: target.research },
    })
    const owner = ownerById(state, target.ownerId)
    const habit = result.revealed === 'full' && owner?.schedule ? habitBlurb(owner.schedule) : null
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
      loyalty: result.revealed === 'none' ? null : Math.floor(target.loyalty),
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
          ? 'A full picture: stores, buildings, garrison, and the lord’s hours.'
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
  target.units = remainGroups[0] ?? cloneUnits(target.units)
  target.support = target.support
    .map((group, index) => ({ ...group, units: remainGroups[index + 1] ?? group.units }))
    .filter((group) => hasUnits(group.units))
  target.buildings.wall = result.wallAfter
  if (result.buildingTarget && result.buildingTarget !== 'wall') {
    target.buildings[result.buildingTarget] = result.buildingAfter
  }
  clampStores(target)

  let conquered = false
  let noblesUsed = 0
  const noblesAlive = result.attackerWins ? result.attackerRemaining.noble : 0
  if (result.attackerWins && noblesAlive > 0) {
    const drops = Array.from({ length: noblesAlive }, () => rollLoyaltyDrop(rng))
    const impact = applyNobleImpact(target.loyalty, drops)
    noblesUsed = noblesAlive
    if (impact.conquered) {
      conquered = true
    } else {
      target.loyalty = Math.max(0, impact.loyalty)
      target.loyaltyAt = now
    }
  }

  if (!conquered && result.attackerWins) {
    target.resources.wood = Math.max(0, target.resources.wood - result.loot.wood)
    target.resources.clay = Math.max(0, target.resources.clay - result.loot.clay)
    target.resources.iron = Math.max(0, target.resources.iron - result.loot.iron)
  }

  const seized = conquered ? floorResources(target.resources) : result.loot
  const battle: BattleView = {
    attackerName: lordName(state, movement.ownerId),
    defenderName: lordName(state, target.ownerId),
    attackerTown: origin.name,
    defenderTown: target.name,
    fromX: origin.x,
    fromY: origin.y,
    toX: target.x,
    toY: target.y,
    luck,
    attackerWins: result.attackerWins,
    attackerUnits: unitLines(sent, result.attackerLosses),
    defenderUnits: unitLines(defenders, result.defenderLosses),
    loot: seized,
    wallBefore: result.wallBefore,
    wallAfter: conquered ? target.buildings.wall : result.wallAfter,
    buildingTarget: result.buildingTarget,
    buildingBefore: result.buildingBefore,
    buildingAfter: result.buildingAfter,
    loyaltyBefore: Math.round(loyaltyBefore),
    loyaltyAfter: conquered ? COMBAT.loyalty.afterConquest : Math.max(0, Math.round(target.loyalty)),
    conquered,
    noblesUsed,
  }

  if (conquered) {
    for (const group of [...target.support]) {
      sendHome(state, group.ownerId, group.originTownId, target, group.units, emptyResources(), now)
    }
    const previousOwner = target.ownerId
    const garrison = cloneUnits(result.attackerRemaining)
    garrison.noble = 0
    target.support = []
    target.buildQueue = []
    target.recruitQueues = emptyRecruitQueues()
    target.researchJob = null
    target.ownerId = movement.ownerId
    target.loyalty = COMBAT.loyalty.afterConquest
    target.loyaltyAt = now
    target.units = garrison
    const title = `${target.name} is taken`
    pushReport(state, {
      id: nid(state, 'r'),
      ownerId: movement.ownerId,
      at: now,
      unread: true,
      kind: 'conquest',
      title,
      summary: `${origin.name} broke the loyalty of ${target.name}. The stores and the walls are yours.`,
      townId: target.id,
      battle,
    })
    pushReport(state, {
      id: nid(state, 'r'),
      ownerId: previousOwner,
      at: now,
      unread: true,
      kind: 'conquest',
      title: `${target.name} fell`,
      summary: `${lordName(state, movement.ownerId)} now holds ${target.name}.`,
      townId: target.id,
      battle,
    })
  } else {
    const winner = result.attackerWins ? battle.attackerName : battle.defenderName
    const summary = result.attackerWins
      ? `${winner} carried off ${seized.wood} wood, ${seized.clay} clay, and ${seized.iron} iron.`
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
      title: result.attackerWins ? `${target.name} was raided` : `${target.name} held`,
      summary,
      townId: target.id,
      battle,
    })
    if (hasUnits(result.attackerRemaining)) {
      sendHome(state, movement.ownerId, movement.originTownId, target, result.attackerRemaining, result.attackerWins ? result.loot : emptyResources(), now)
    }
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
          executeBotOrder(state, current, next)
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
  syncAllResources(state.towns, target)
  for (const town of state.towns) {
    town.loyalty = loyaltyAt(town.loyalty, town.loyaltyAt, target)
    town.loyaltyAt = target
  }
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
