import type { Difficulty, Personality } from '../config/ai.ts'
import { WORLD } from '../config/world.ts'
import { hours } from './time.ts'
import { makeRng, type Rng } from './rng.ts'
import { emptyBuildings, emptyRecruitQueues, emptyResources, emptyUnits } from './defaults.ts'
import { nextLoginAt } from './schedule.ts'
import { terrainAt } from './terrain.ts'
import { rollBot } from './bots.ts'
import { nid, type GameState, type Owner, type Town, type UnitCounts } from './types.ts'

const TOWN_A = ['Ash', 'Red', 'Oak', 'Iron', 'Wolf', 'High', 'Grey', 'Stone', 'Mill', 'Thorn', 'Black', 'River', 'Cold', 'Fair', 'Hart', 'Briar', 'Dun', 'Low']
const TOWN_B = ['ford', 'wick', 'holm', 'barrow', 'field', 'keep', 'dale', 'moor', 'bridge', 'haven', 'watch', 'fall', 'stead', 'cross', 'mere', 'gate']
const LORD_NAMES = [
  'Mara Quinn',
  'Edric Holt',
  'Sable Venn',
  'Torin Peck',
  'Ilya Moss',
  'Harun Dale',
  'Bram Keel',
  'Nessa Crowe',
  'Otto Fen',
  'Lira Sand',
  'Colm Ash',
  'Wynn Harth',
  'Petra Slate',
  'Joss Ember',
  'Halden Fry',
  'Rosa Mink',
  'Ewan Briar',
  'Tamsin Gore',
  'Leif Carr',
  'Anouk Pell',
  'Soren Voss',
  'Maida Kline',
  'Rufus Bell',
  'Cress Holm',
]

const ROSTER: { personality: Personality; difficulty: Difficulty }[] = [
  { personality: 'farmer', difficulty: 'easy' },
  { personality: 'farmer', difficulty: 'easy' },
  { personality: 'farmer', difficulty: 'normal' },
  { personality: 'defender', difficulty: 'easy' },
  { personality: 'defender', difficulty: 'normal' },
  { personality: 'defender', difficulty: 'normal' },
  { personality: 'raider', difficulty: 'normal' },
  { personality: 'raider', difficulty: 'normal' },
  { personality: 'raider', difficulty: 'hard' },
  { personality: 'expander', difficulty: 'normal' },
  { personality: 'expander', difficulty: 'hard' },
  { personality: 'expander', difficulty: 'hard' },
]

function rollInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1))
}

function townName(rng: Rng, used: Set<string>): string {
  for (let i = 0; i < 40; i++) {
    const name = `${TOWN_A[Math.floor(rng() * TOWN_A.length)]} ${TOWN_B[Math.floor(rng() * TOWN_B.length)]}`
    if (!used.has(name)) {
      used.add(name)
      return name
    }
  }
  const name = `Camp ${used.size + 1}`
  used.add(name)
  return name
}

function baseTown(state: GameState, name: string, x: number, y: number, ownerId: string): Town {
  return {
    id: nid(state, 't'),
    name,
    x,
    y,
    ownerId,
    workPace: 1,
    buildings: emptyBuildings(),
    buildQueue: [],
    resources: emptyResources(),
    resourcesAt: state.gameTime,
    units: emptyUnits(),
    support: [],
    recruitQueues: emptyRecruitQueues(),
    research: {},
    researchJob: null,
  }
}

function tooClose(state: GameState, x: number, y: number, spacing: number): boolean {
  return state.towns.some((town) => Math.hypot(town.x - x, town.y - y) < spacing)
}

function place(
  state: GameState,
  rng: Rng,
  spacing: number,
  near?: { x: number; y: number; min: number; max: number },
): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    let x: number
    let y: number
    if (near) {
      const angle = rng() * Math.PI * 2
      const radius = near.min + rng() * (near.max - near.min)
      x = Math.round(near.x + Math.cos(angle) * radius)
      y = Math.round(near.y + Math.sin(angle) * radius)
    } else {
      x = 1 + Math.floor(rng() * (state.mapWidth - 2))
      y = 1 + Math.floor(rng() * (state.mapHeight - 2))
    }
    if (x < 1 || y < 1 || x >= state.mapWidth - 1 || y >= state.mapHeight - 1) continue
    if (terrainAt(x, y, state.terrainSeed) === 'water') continue
    if (tooClose(state, x, y, spacing)) continue
    return { x, y }
  }
  return null
}

function findPlayerSpot(state: GameState): { x: number; y: number } {
  const cx = Math.floor(state.mapWidth / 2)
  const cy = Math.floor(state.mapHeight / 2)
  if (terrainAt(cx, cy, state.terrainSeed) !== 'water') return { x: cx, y: cy }
  for (let radius = 1; radius < 12; radius++) {
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        if (x < 1 || y < 1 || x >= state.mapWidth - 1 || y >= state.mapHeight - 1) continue
        if (terrainAt(x, y, state.terrainSeed) !== 'water') return { x, y }
      }
    }
  }
  return { x: cx, y: cy }
}

function give(units: UnitCounts, patch: Partial<UnitCounts>): void {
  Object.assign(units, { ...units, ...patch })
}

function stock(town: Town, wood: number, clay: number, iron: number): void {
  town.resources = { wood, clay, iron }
}

function developPlayer(town: Town): void {
  town.buildings.headquarters = 1
  town.buildings.timber = 1
  town.buildings.clay = 1
  town.buildings.iron = 1
  town.buildings.farm = 1
  town.buildings.warehouse = 1
  town.buildings.rally = 1
  stock(town, WORLD.startResources.wood, WORLD.startResources.clay, WORLD.startResources.iron)
}

function developBot(town: Town, personality: Personality, difficulty: Difficulty, rng: Rng): void {
  town.buildings.headquarters = difficulty === 'hard' ? 3 : difficulty === 'normal' ? 2 : 1
  const mines = town.buildings.headquarters
  town.buildings.timber = mines
  town.buildings.clay = mines
  town.buildings.iron = mines
  town.buildings.farm = mines
  town.buildings.warehouse = Math.max(1, mines - 1)
  town.buildings.rally = 1
  town.buildings.barracks = difficulty === 'easy' ? 1 : mines
  if (personality === 'defender') {
    town.buildings.wall = difficulty === 'easy' ? 1 : 2
    town.buildings.smithy = difficulty === 'easy' ? 0 : 1
    if (town.buildings.smithy >= 1) town.research.sword = 1
    give(town.units, { spear: difficulty === 'easy' ? 10 : 22, sword: difficulty === 'easy' ? 0 : 8 })
  } else if (personality === 'raider') {
    town.buildings.smithy = 1
    town.research.axe = 1
    town.buildings.wall = difficulty === 'hard' ? 1 : 0
    if (difficulty === 'hard') {
      town.buildings.headquarters = 3
      town.buildings.barracks = 3
      town.buildings.stable = 1
      town.buildings.smithy = 2
      town.research.axe = 2
      town.research.light = 1
      give(town.units, { axe: 22, light: 6, spear: 8 })
    } else {
      give(town.units, { axe: 16, spear: 4 })
    }
  } else if (personality === 'expander') {
    town.buildings.smithy = difficulty === 'hard' ? 2 : 1
    town.research.axe = 1
    town.buildings.barracks = difficulty === 'hard' ? 3 : 2
    if (difficulty === 'hard') {
      town.buildings.academy = 1
      town.buildings.workshop = 1
      give(town.units, { commander: 1, ram: 4 })
    }
    town.buildings.wall = 1
    give(town.units, { axe: 14, spear: 10 })
  } else {
    give(town.units, { spear: difficulty === 'easy' ? 6 : 12 })
  }
  const pile = difficulty === 'hard' ? rollInt(rng, 1100, 1500) : rollInt(rng, 650, 950)
  stock(town, pile, pile - rollInt(rng, 0, 80), pile - rollInt(rng, 40, 140))
}

function developBarbarian(town: Town, guarded: boolean, rng: Rng): void {
  town.buildings.headquarters = 1
  town.buildings.timber = rollInt(rng, 1, guarded ? 2 : 4)
  town.buildings.clay = rollInt(rng, 1, 3)
  town.buildings.iron = rollInt(rng, 1, 3)
  town.buildings.warehouse = guarded ? 2 : 3
  town.buildings.farm = 1
  if (guarded) {
    town.buildings.wall = 1
    town.buildings.barracks = 1
    give(town.units, { spear: rollInt(rng, 8, 22) })
    const pile = rollInt(rng, 900, 1500)
    stock(town, pile, pile, Math.floor(pile * 0.7))
  } else {
    const pile = rollInt(rng, 1800, 3200)
    stock(town, pile, pile - rollInt(rng, 0, 400), pile - rollInt(rng, 200, 700))
  }
}

function blankOwner(id: string, name: string, kind: Owner['kind']): Owner {
  return {
    id,
    name,
    kind,
    personality: null,
    difficulty: null,
    schedule: null,
    traits: null,
    nextLoginAt: null,
    lastLoginAt: null,
    sessionEndsAt: null,
    orders: [],
  }
}

export function newGame(opts: {
  speed: number
  seed: number
  realNow: number
  playerName: string
  botClock?: 'real' | 'compressed'
}): GameState {
  const state: GameState = {
    version: 3,
    botClock: opts.botClock ?? 'real',
    seed: opts.seed >>> 0,
    rngState: (opts.seed || 1) >>> 0,
    speed: opts.speed,
    gameTime: hours(WORLD.startHour),
    lastRealMs: opts.realNow,
    mapWidth: WORLD.mapWidth,
    mapHeight: WORLD.mapHeight,
    terrainSeed: (opts.seed ^ 0x9e3779b9) >>> 0,
    nextId: 1,
    playerId: 'player',
    selectedTownId: '',
    defeated: false,
    owners: [blankOwner('player', opts.playerName.trim() || 'Warden', 'player'), blankOwner('wild', 'Unclaimed', 'barbarian')],
    towns: [],
    movements: [],
    sieges: [],
    aidCalls: [],
    reports: [],
  }
  const rng = makeRng(state)
  const used = new Set<string>()
  const spot = findPlayerSpot(state)
  const home = baseTown(state, townName(rng, used), spot.x, spot.y, 'player')
  developPlayer(home)
  state.towns.push(home)
  state.selectedTownId = home.id

  const names = [...LORD_NAMES]
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const swap = names[i]
    names[i] = names[j]
    names[j] = swap
  }

  ROSTER.forEach((slot, index) => {
    const near = index === 8 ? { x: home.x, y: home.y, min: 9, max: 13 } : undefined
    const spacing = near ? 4 : 5
    const at = place(state, rng, spacing, near) ?? place(state, rng, 3)
    if (!at) return
    const rolled = rollBot(slot.personality, slot.difficulty, rng)
    const owner: Owner = {
      ...blankOwner(nid(state, 'bot'), names[index % names.length] ?? `Lord ${index + 1}`, 'bot'),
      personality: slot.personality,
      difficulty: slot.difficulty,
      schedule: rolled.schedule,
      traits: rolled.traits,
    }
    const scheduleOrigin = state.botClock === 'compressed' ? state.gameTime : opts.realNow
    owner.nextLoginAt = nextLoginAt(rolled.schedule, scheduleOrigin, rng)
    state.owners.push(owner)
    const town = baseTown(state, townName(rng, used), at.x, at.y, owner.id)
    developBot(town, slot.personality, slot.difficulty, rng)
    state.towns.push(town)
  })

  const barbPlan: { near: boolean; guarded: boolean; min: number; max: number }[] = [
    { near: true, guarded: false, min: 4, max: 7 },
    { near: true, guarded: false, min: 4, max: 7 },
    { near: true, guarded: false, min: 5, max: 8 },
    { near: true, guarded: true, min: 8, max: 12 },
    { near: true, guarded: true, min: 8, max: 12 },
  ]
  while (barbPlan.length < WORLD.barbarianCount) {
    barbPlan.push({ near: false, guarded: barbPlan.length % 3 === 0, min: 0, max: 0 })
  }
  for (const plan of barbPlan) {
    const at = plan.near
      ? (place(state, rng, 3, { x: home.x, y: home.y, min: plan.min, max: plan.max }) ?? place(state, rng, 3))
      : (place(state, rng, 4) ?? place(state, rng, 3))
    if (!at) continue
    const town = baseTown(state, townName(rng, used), at.x, at.y, 'wild')
    developBarbarian(town, plan.guarded, rng)
    state.towns.push(town)
  }

  state.reports.unshift({
    id: nid(state, 'r'),
    ownerId: state.playerId,
    at: state.gameTime,
    unread: true,
    kind: 'system',
    title: `${home.name} is yours`,
    summary:
      'Timber, clay, and iron are already coming in. Raise a barracks and blood a company on an abandoned hamlet. To take a town, win the field with a commander or siege engines and hold the camp until the clock runs out. Rival lords keep their own hours. They sleep, they wander off, and they may answer a siege late.',
    townId: home.id,
  })
  return state
}
