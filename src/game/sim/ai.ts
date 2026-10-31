import { BUILDING_IDS, type BuildingId } from '../config/ids.ts'
import { AI_CONFIG, type Personality } from '../config/ai.ts'
import { UNITS } from '../config/units.ts'
import { SIEGE } from '../config/world.ts'
import { enqueueBuilding, explainBuild, findTown } from './buildings.ts'
import { sendArmy } from './commands.ts'
import { hasUnits } from './defaults.ts'
import { effectiveLevels, populationCapacity, storageCapacity, townPoints } from './formulas.ts'
import { popOf } from './formulas.ts'
import { distance, portionUnits, travelMs } from './movement.ts'
import { combatPop } from './population.ts'
import { explainResearch, maxAffordable, startResearch, enqueueRecruit } from './recruit.ts'
import { lerp, makeRng, type Rng } from './rng.ts'
import { GAME_MINUTE_MS } from './time.ts'
import { evaluateIncomingReaction, gameInstantToSchedule, gameSpanToSchedule, nextLoginAt, phaseAt, rollSession } from './schedule.ts'
import { syncAllResources } from './resources.ts'
import { siegeWeight } from './siege.ts'
import { nid, type BotOrder, type BotTraits, type GameState, type Owner, type Town } from './types.ts'

type OrderDraft = BotOrder extends infer T ? (T extends { id: string; at: number } ? Omit<T, 'id' | 'at'> : never) : never

export function desiredLevel(style: Personality, id: BuildingId, town: Town): number {
  const hq = Math.max(1, town.buildings.headquarters)
  const cap = (n: number, max = 20) => Math.max(0, Math.min(max, Math.round(n)))
  const economy = style === 'farmer' ? hq + 2 : style === 'raider' ? hq : hq + 1
  const table: Record<BuildingId, number> = {
    headquarters: cap(hq < 12 ? hq + 1 : 12),
    timber: cap(economy),
    clay: cap(economy),
    iron: cap(style === 'raider' || style === 'expander' ? economy + 1 : economy),
    farm: cap(Math.ceil(hq * 0.9) + 1),
    warehouse: cap(Math.ceil(hq * 0.75) + 1),
    barracks: cap(style === 'raider' ? hq + 1 : style === 'defender' ? hq : Math.max(1, hq - 1), 15),
    stable: cap(
      style === 'raider' ? Math.max(0, hq - 1) : style === 'expander' ? Math.max(0, hq - 2) : style === 'defender' ? Math.max(0, hq - 3) : 0,
      12,
    ),
    workshop: cap(style === 'expander' ? Math.max(0, hq - 4) : style === 'raider' ? Math.max(0, hq - 5) : 0, 8),
    wall: cap(style === 'defender' ? hq + 2 : style === 'farmer' ? Math.max(0, hq - 2) : Math.max(0, hq - 1), 15),
    smithy: cap(style === 'farmer' ? Math.max(0, hq - 2) : Math.max(0, hq - 1), 12),
    market: cap(style === 'farmer' ? Math.max(0, hq - 2) : Math.max(0, hq - 3), 10),
    rally: 1,
    academy: cap(style === 'expander' ? Math.max(1, hq - 4) : 0, 3),
  }
  return table[id]
}

function scoreBuild(id: BuildingId, town: Town, traits: BotTraits, nearlyFull: boolean): number {
  const level = effectiveLevels(town)[id]
  const desired = desiredLevel(traits.targetStyle, id, town)
  let score = level >= desired ? 0 : traits.buildWeights[id] * Math.max(1, desired - level)
  if (id === 'warehouse' && nearlyFull) score += 80
  if (id === 'farm') {
    const cap = populationCapacity(town.buildings.farm)
    if (cap > 0 && popOf(town.units) / cap > 0.72) score += 40
  }
  return score
}

/** Picks one building, or nothing if they hesitate or nothing legal is worth it. */
export function chooseBuild(town: Town, traits: BotTraits, rng: Rng): BuildingId | null {
  const legal: BuildingId[] = []
  for (const id of BUILDING_IDS) {
    if (!explainBuild(town, id)) legal.push(id)
  }
  if (legal.length === 0) return null
  if (rng() < traits.hesitation) return null
  if (rng() < traits.mistakeChance) return legal[Math.floor(rng() * legal.length)] ?? legal[0]
  const cap = storageCapacity(town.buildings.warehouse)
  const nearlyFull =
    town.resources.wood > cap * 0.82 || town.resources.clay > cap * 0.82 || town.resources.iron > cap * 0.82
  const ranked = legal
    .map((id) => ({ id, score: scoreBuild(id, town, traits, nearlyFull) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
  if (ranked.length === 0) return null
  if (ranked.length > 1 && rng() < traits.fickle) return ranked[1].id
  return ranked[0].id
}

export function pickDodgeDestination(state: GameState, from: Town, avoidId: string): string | null {
  const owned = state.towns
    .filter((town) => town.ownerId === from.ownerId && town.id !== from.id)
    .sort((a, b) => distance(from, a) - distance(from, b))
  if (owned[0]) return owned[0].id
  let best: Town | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const town of state.towns) {
    if (town.id === from.id || town.id === avoidId) continue
    const dist = distance(from, town)
    if (dist < bestDist) {
      best = town
      bestDist = dist
    }
  }
  return best?.id ?? null
}

function pickSupport(state: GameState, owned: Town[], target: Town, arrivesGame: number, reactsSchedule: number, scheduleNow: number): Town | null {
  const arrivesAt = gameInstantToSchedule(state, arrivesGame, state.gameTime, scheduleNow)
  let best: Town | null = null
  let bestDist = Number.POSITIVE_INFINITY
  for (const town of owned) {
    if (town.id === target.id || town.buildings.rally < 1 || combatPop(town.units) < 8) continue
    const dist = distance(town, target)
    if (reactsSchedule + gameSpanToSchedule(state, travelMs(dist, town.units)) >= arrivesAt) continue
    if (dist < bestDist) {
      best = town
      bestDist = dist
    }
  }
  return best
}

function pickTarget(state: GameState, town: Town, traits: BotTraits, rng: Rng): Town | null {
  const candidates: { town: Town; score: number }[] = []
  for (const other of state.towns) {
    if (other.id === town.id || other.ownerId === town.ownerId) continue
    const dist = distance(town, other)
    if (dist > traits.maxRaidDistance) continue
    const owner = state.owners.find((entry) => entry.id === other.ownerId)
    let score = 18 - dist
    if (owner?.kind === 'barbarian') score += traits.barbarianBias
    if (other.ownerId === state.playerId) score += traits.playerBias
    score += Math.max(0, 18 - townPoints(other)) * traits.weakBias
    score += rng() * traits.targetNoise
    candidates.push({ town: other, score })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.score - a.score)
  if (rng() < traits.mistakeChance && candidates.length > 1) {
    return candidates[Math.floor(rng() * candidates.length)]?.town ?? candidates[0].town
  }
  return candidates[0].town
}

function planOrders(
  state: GameState,
  owner: Owner,
  scheduleNow: number,
  reactsAt: number,
  sessionEnd: number,
  phaseActive: boolean,
  alerted: boolean,
  rng: Rng,
): BotOrder[] {
  const schedule = owner.schedule
  const traits = owner.traits
  if (!schedule || !traits) return []
  const orders: BotOrder[] = []
  const owned = state.towns.filter((town) => town.ownerId === owner.id)
  if (owned.length === 0) return orders
  let clicks = 0
  const cap = phaseActive ? traits.activeClicks : 1
  const push = (order: OrderDraft): boolean => {
    if (clicks >= cap) return false
    const at = reactsAt + clicks * schedule.clickGapMs
    if (at >= sessionEnd) return false
    orders.push({ ...order, id: nid(state, 'o'), at } as BotOrder)
    clicks += 1
    return true
  }
  respondToSieges(state, owner, owned, scheduleNow, reactsAt, sessionEnd, alerted, rng, push)

  const incoming = state.movements
    .filter(
      (movement) =>
        (movement.mission === 'attack' || movement.mission === 'siege' || movement.mission === 'scout') &&
        owned.some((town) => town.id === movement.targetTownId) &&
        movement.arrivesAt > state.gameTime,
    )
    .sort((a, b) => a.arrivesAt - b.arrivesAt)

  for (const attack of incoming.slice(0, 2)) {
    const sessionLength = sessionEnd - scheduleNow
    const decision = evaluateIncomingReaction({
      schedule,
      logins: [
        {
          at: scheduleNow,
          sessionLengthMs: sessionLength,
          reactionDelayMs: reactsAt - scheduleNow,
        },
      ],
      arrivesAt: gameInstantToSchedule(state, attack.arrivesAt, state.gameTime, scheduleNow),
      noticeRolls: [alerted ? 0 : rng()],
      attention: traits.attention,
    })
    if (!decision.notices) continue
    const town = owned.find((entry) => entry.id === attack.targetTownId)
    if (!town) continue
    if (hasUnits(town.units) && rng() < traits.dodgeChance) {
      const dest = pickDodgeDestination(state, town, attack.originTownId)
      if (dest && push({ type: 'dodge', fromTownId: town.id, toTownId: dest })) continue
    }
    const helper = pickSupport(state, owned, town, attack.arrivesAt, reactsAt, scheduleNow)
    if (helper && rng() < traits.caution) {
      push({ type: 'support', fromTownId: helper.id, toTownId: town.id, portion: 0.55 })
    }
  }

  const focus = owned[Math.min(owned.length - 1, Math.floor(rng() * owned.length))]
  const build = chooseBuild(focus, traits, rng)
  if (build) push({ type: 'build', townId: focus.id, buildingId: build })

  for (const unitId of traits.preferredUnits) {
    if (clicks >= cap) break
    const unit = UNITS[unitId]
    if (focus.buildings[unit.trainBuilding] < 1) continue
    if (unit.requiresResearch && (focus.research[unitId] ?? 0) < 1) {
      if (!explainResearch(focus, unitId)) {
        push({ type: 'research', townId: focus.id, unitId })
        break
      }
      continue
    }
    if (focus.recruitQueues[unit.trainBuilding]) continue
    const affordable = maxAffordable(focus, state, unitId)
    if (affordable <= 0) continue
    const reserved = Math.floor(affordable * traits.spendReserve)
    let budget = affordable - reserved
    if (budget <= 0) {
      if (rng() < traits.mistakeChance) budget = affordable
      else continue
    }
    const portion = 0.35 + rng() * 0.65
    let count = Math.max(1, Math.floor(budget * portion))
    if (rng() < traits.mistakeChance) count = Math.max(1, Math.ceil(count * 0.35))
    count = Math.min(affordable, budget, count)
    if (count >= 1) push({ type: 'recruit', townId: focus.id, unitId, count })
    break
  }

  if (traits.attackChance > 0 && focus.buildings.rally >= 1 && combatPop(focus.units) >= traits.minRaidPop) {
    const already = state.movements.filter(
      (movement) =>
        movement.originTownId === focus.id &&
        (movement.mission === 'attack' || movement.mission === 'siege' || movement.mission === 'scout'),
    ).length
    if (already < 2 && rng() <= traits.attackChance) {
      const target = pickTarget(state, focus, traits, rng)
      if (target) {
        const sloppy = rng() < traits.mistakeChance
        const portion = sloppy ? 0.22 + rng() * 0.2 : 0.62 + rng() * 0.38
        const mode =
          siegeWeight(focus.units) >= SIEGE.minWeight &&
          popOf(focus.units) >= SIEGE.minHoldPop &&
          rng() < SIEGE.siegeChance[traits.targetStyle]
            ? 'siege'
            : 'raid'
        let catapultTarget: BuildingId | null = null
        if (focus.units.catapult > 0) catapultTarget = rng() < traits.mistakeChance ? 'farm' : 'wall'
        push({
          type: 'attack',
          fromTownId: focus.id,
          toTownId: target.id,
          portion,
          mode,
          catapultTarget,
        })
      }
    }
  }

  if (owned.length > 1 && clicks < cap && rng() < 0.4) {
    const other = owned.find((town) => town.id !== focus.id)
    if (other) {
      const extra = chooseBuild(other, traits, rng)
      if (extra) push({ type: 'build', townId: other.id, buildingId: extra })
    }
  }

  return orders
}

function rollAlertSession(rng: Rng): { lengthMs: number; reactionDelayMs: number } {
  const click = Math.max(
    GAME_MINUTE_MS,
    Math.round(lerp(AI_CONFIG.alertClickMin[0], AI_CONFIG.alertClickMin[1], rng()) * GAME_MINUTE_MS),
  )
  const stay = Math.max(
    click + GAME_MINUTE_MS,
    Math.round(lerp(AI_CONFIG.alertStayMin[0], AI_CONFIG.alertStayMin[1], rng()) * GAME_MINUTE_MS),
  )
  return { lengthMs: stay, reactionDelayMs: click }
}

export function botLogin(state: GameState, owner: Owner, scheduleNow: number): void {
  if (owner.kind !== 'bot' || !owner.schedule || !owner.traits) return
  const now = scheduleNow
  const alerted = owner.wokenByAlert === true
  owner.wokenByAlert = false
  owner.orders = owner.orders.filter((order) => order.at > now)
  syncAllResources(state, state.gameTime)
  const rng = makeRng(state)
  const phase = phaseAt(owner.schedule, now)
  const session = alerted && phase === 'sleep' ? rollAlertSession(rng) : rollSession(owner.schedule, phase, rng)
  owner.lastLoginAt = now
  owner.sessionEndsAt = now + session.lengthMs
  owner.nextLoginAt = nextLoginAt(owner.schedule, owner.sessionEndsAt, rng)
  if (owner.nextLoginAt <= now) owner.nextLoginAt = now + owner.schedule.minCheckGapMs
  if (session.reactionDelayMs >= session.lengthMs) return
  const reactsAt = now + session.reactionDelayMs
  if (reactsAt <= now || reactsAt >= owner.sessionEndsAt) return
  const orders = planOrders(state, owner, now, reactsAt, owner.sessionEndsAt, phase === 'active', alerted, rng)
  owner.orders.push(...orders)
  owner.orders.sort((a, b) => a.at - b.at)
}

export function executeBotOrder(state: GameState, owner: Owner, order: BotOrder): void {
  if (order.type === 'build') {
    const town = findTown(state, order.townId)
    if (!town || town.ownerId !== owner.id) return
    enqueueBuilding(state, order.townId, order.buildingId)
    return
  }
  if (order.type === 'research') {
    const town = findTown(state, order.townId)
    if (!town || town.ownerId !== owner.id) return
    startResearch(state, order.townId, order.unitId)
    return
  }
  if (order.type === 'recruit') {
    const town = findTown(state, order.townId)
    if (!town || town.ownerId !== owner.id) return
    let count = order.count
    while (count >= 1) {
      const error = enqueueRecruit(state, order.townId, order.unitId, count)
      if (!error) return
      if (count === 1) return
      count = Math.floor(count / 2)
    }
    return
  }
  if (order.type === 'dodge') {
    const from = findTown(state, order.fromTownId)
    const to = findTown(state, order.toTownId)
    if (!from || !to || from.ownerId !== owner.id) return
    const mission = to.ownerId === owner.id ? 'support' : 'attack'
    const units = portionUnits(from.units, 1, true)
    sendArmy(state, from.id, to.id, mission, units, mission === 'attack' ? 'wall' : null)
    return
  }
  if (order.type === 'support' || order.type === 'relief') {
    const from = findTown(state, order.fromTownId)
    if (!from || from.ownerId !== owner.id) return
    const units = portionUnits(from.units, order.portion, order.type === 'relief')
    sendArmy(state, order.fromTownId, order.toTownId, order.type === 'relief' ? 'relief' : 'support', units, null)
    return
  }
  if (order.type === 'sally' || order.type === 'aid') return
  const from = findTown(state, order.fromTownId)
  if (!from || from.ownerId !== owner.id) return
  const units = portionUnits(from.units, order.portion, order.mode === 'siege')
  sendArmy(state, order.fromTownId, order.toTownId, order.mode === 'siege' ? 'siege' : 'attack', units, order.catapultTarget)
}

function respondToSieges(
  state: GameState,
  owner: Owner,
  owned: Town[],
  scheduleNow: number,
  reactsAt: number,
  sessionEnd: number,
  alerted: boolean,
  rng: Rng,
  push: (order: OrderDraft) => boolean,
): void {
  const schedule = owner.schedule
  const traits = owner.traits
  if (!schedule || !traits) return
  for (const siege of state.sieges) {
    if (siege.attackerOwnerId === owner.id) continue
    const home = owned.find((town) => town.id === siege.townId)
    const siegeEnds = gameInstantToSchedule(state, siege.endsAt, state.gameTime, scheduleNow)
    if (!home || siegeEnds <= reactsAt) continue
    const decision = evaluateIncomingReaction({
      schedule,
      logins: [{ at: scheduleNow, sessionLengthMs: sessionEnd - scheduleNow, reactionDelayMs: reactsAt - scheduleNow }],
      arrivesAt: siegeEnds,
      noticeRolls: [alerted ? 0 : rng()],
      attention: traits.attention,
    })
    if (!decision.notices) continue
    if (hasUnits(home.units) && rng() < 0.35 + traits.caution * 0.4) push({ type: 'sally', townId: home.id })
    const helper = owned
      .filter((town) => town.id !== home.id && town.buildings.rally >= 1 && combatPop(town.units) >= 8)
      .sort((a, b) => distance(a, home) - distance(b, home))[0]
    if (
      helper &&
      reactsAt + gameSpanToSchedule(state, travelMs(distance(helper, home), helper.units)) < siegeEnds &&
      rng() < Math.min(0.92, traits.caution + 0.3)
    ) {
      push({ type: 'relief', fromTownId: helper.id, toTownId: home.id, portion: 0.75 })
    }
    if (!state.aidCalls.some((call) => call.townId === home.id && call.expiresAt > state.gameTime)) {
      push({ type: 'aid', townId: home.id })
    }
  }
  for (const call of state.aidCalls) {
    if (call.ownerId === owner.id || gameInstantToSchedule(state, call.expiresAt, state.gameTime, scheduleNow) <= reactsAt) continue
    const siege = state.sieges.find((entry) => entry.townId === call.townId)
    if (!siege || siege.attackerOwnerId === owner.id) continue
    if (rng() > SIEGE.aidChance[traits.targetStyle]) continue
    const target = state.towns.find((town) => town.id === call.townId)
    if (!target) continue
    const helper = owned
      .filter((town) => town.buildings.rally >= 1 && combatPop(town.units) >= 8 && distance(town, target) <= SIEGE.aidRadius)
      .sort((a, b) => distance(a, target) - distance(b, target))[0]
    if (!helper) continue
    const late =
      reactsAt + gameSpanToSchedule(state, travelMs(distance(helper, target), helper.units)) >=
      gameInstantToSchedule(state, siege.endsAt, state.gameTime, scheduleNow)
    if (late && rng() > traits.mistakeChance) continue
    push({ type: 'relief', fromTownId: helper.id, toTownId: target.id, portion: 0.55 })
  }
}
