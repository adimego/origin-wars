import type { BuildingId } from '../config/ids.ts'
import { emptyBuildings, emptyRecruitQueues, emptyUnits } from './defaults.ts'
import { advance } from './engine.ts'
import type { BotSchedule, BotTraits, GameState, Owner, Town } from './types.ts'

export function makeTown(partial: Partial<Town> & { id: string; ownerId: string }): Town {
  return {
    name: partial.name ?? partial.id,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    loyalty: partial.loyalty ?? 100,
    loyaltyAt: partial.loyaltyAt ?? 0,
    buildings: partial.buildings ?? emptyBuildings(),
    buildQueue: partial.buildQueue ?? [],
    resources: partial.resources ?? { wood: 0, clay: 0, iron: 0 },
    resourcesAt: partial.resourcesAt ?? 0,
    units: partial.units ?? emptyUnits(),
    support: partial.support ?? [],
    recruitQueues: partial.recruitQueues ?? emptyRecruitQueues(),
    research: partial.research ?? {},
    researchJob: partial.researchJob ?? null,
    ...partial,
  }
}

export function makeOwner(partial: Partial<Owner> & { id: string; kind: Owner['kind'] }): Owner {
  return {
    name: partial.name ?? partial.id,
    personality: null,
    difficulty: null,
    schedule: null,
    traits: null,
    nextLoginAt: null,
    lastLoginAt: null,
    sessionEndsAt: null,
    orders: [],
    ...partial,
  }
}

export function makeState(): GameState {
  return {
    version: 1,
    seed: 1,
    rngState: 1,
    speed: 1,
    gameTime: 0,
    lastRealMs: 0,
    mapWidth: 20,
    mapHeight: 20,
    terrainSeed: 1,
    nextId: 10,
    playerId: 'player',
    selectedTownId: 'home',
    defeated: false,
    owners: [makeOwner({ id: 'player', kind: 'player', name: 'Warden' })],
    towns: [],
    movements: [],
    reports: [],
  }
}

export function starterBuildings(extra: Partial<Record<BuildingId, number>> = {}): Record<BuildingId, number> {
  const buildings = emptyBuildings()
  buildings.headquarters = 1
  buildings.timber = 1
  buildings.clay = 1
  buildings.iron = 1
  buildings.farm = 1
  buildings.warehouse = 1
  buildings.rally = 1
  for (const [id, level] of Object.entries(extra)) buildings[id as BuildingId] = level ?? 0
  return buildings
}

export function flatSchedule(patch: Partial<BotSchedule> = {}): BotSchedule {
  const session = 40 * 60_000
  const base: BotSchedule = {
    timezoneOffsetHours: 0,
    chronotype: 'daytime',
    sleepStartHour: 0,
    sleepEndHour: 0,
    busyWindows: [],
    restWeekday: null,
    sleepCheckProbability: 0,
    sleepCheckMinMs: 20 * 60_000,
    sleepCheckMaxMs: 40 * 60_000,
    wakeDelayMinMs: 8 * 60_000,
    wakeDelayMaxMs: 8 * 60_000,
    activeCheckMeanMs: 50 * 60_000,
    busyCheckMeanMs: 200 * 60_000,
    checkJitter: 0.5,
    minCheckGapMs: 12 * 60_000,
    sessionMinMs: { sleep: session, busy: session, active: session },
    sessionMaxMs: { sleep: session, busy: session, active: session },
    reactionMinMs: 10 * 60_000,
    reactionMaxMs: 10 * 60_000,
    noticeChance: { sleep: 0.15, busy: 0.45, active: 0.84 },
    clickGapMs: 60_000,
  }
  return { ...base, ...patch, sessionMinMs: { ...base.sessionMinMs, ...patch.sessionMinMs }, sessionMaxMs: { ...base.sessionMaxMs, ...patch.sessionMaxMs }, noticeChance: { ...base.noticeChance, ...patch.noticeChance } }
}

export function focusedTraits(patch: Partial<BotTraits> = {}): BotTraits {
  const weights = starterBuildings()
  for (const id of Object.keys(weights) as BuildingId[]) weights[id] = 1
  weights.timber = 10
  weights.clay = 8
  weights.iron = 7
  weights.warehouse = 4
  weights.headquarters = 3
  return {
    attackChance: 0,
    dodgeChance: 0,
    caution: 0,
    minRaidPop: 100,
    maxRaidDistance: 8,
    spendReserve: 0,
    activeClicks: 2,
    attention: 0,
    mistakeChance: 0,
    hesitation: 0,
    fickle: 0,
    barbarianBias: 0,
    playerBias: 0,
    weakBias: 0,
    targetNoise: 0,
    preferredUnits: ['spear'],
    buildWeights: weights,
    targetStyle: 'farmer',
    ...patch,
  }
}

export function atGame(state: GameState, gameTime: number): GameState {
  const real = state.lastRealMs + (gameTime - state.gameTime) / state.speed
  return advance(state, real)
}
