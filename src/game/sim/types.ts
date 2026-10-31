import type { Chronotype, Difficulty, Personality } from '../config/ai.ts'
import type { BuildingId, Resources, TrainBuilding, UnitId } from '../config/ids.ts'

export type Phase = 'sleep' | 'busy' | 'active'
export type Mission = 'attack' | 'siege' | 'relief' | 'support' | 'scout' | 'return' | 'trade'
export type UnitCounts = Record<UnitId, number>

export interface BotSchedule {
  timezoneOffsetHours: number
  chronotype: Chronotype
  sleepStartHour: number
  sleepEndHour: number
  busyWindows: { startHour: number; endHour: number }[]
  restWeekday: number | null
  sleepCheckProbability: number
  sleepCheckMinMs: number
  sleepCheckMaxMs: number
  wakeDelayMinMs: number
  wakeDelayMaxMs: number
  activeCheckMeanMs: number
  busyCheckMeanMs: number
  checkJitter: number
  minCheckGapMs: number
  sessionMinMs: Record<Phase, number>
  sessionMaxMs: Record<Phase, number>
  reactionMinMs: number
  reactionMaxMs: number
  noticeChance: Record<Phase, number>
  clickGapMs: number
}

export interface BotTraits {
  attackChance: number
  dodgeChance: number
  caution: number
  minRaidPop: number
  maxRaidDistance: number
  spendReserve: number
  activeClicks: number
  attention: number
  mistakeChance: number
  hesitation: number
  fickle: number
  barbarianBias: number
  playerBias: number
  weakBias: number
  targetNoise: number
  /** Chance, while asleep, of sitting up for an alarm on their own town or an aid call. 0 sleeps through. 1 keeps the phone on. */
  wakeOnAlert: number
  preferredUnits: UnitId[]
  buildWeights: Record<BuildingId, number>
  targetStyle: Personality
}

export type BotOrder =
  | { id: string; at: number; type: 'build'; townId: string; buildingId: BuildingId }
  | { id: string; at: number; type: 'recruit'; townId: string; unitId: UnitId; count: number }
  | { id: string; at: number; type: 'research'; townId: string; unitId: UnitId }
  | {
      id: string
      at: number
      type: 'attack'
      fromTownId: string
      toTownId: string
      portion: number
      mode: 'raid' | 'siege'
      catapultTarget: BuildingId | null
    }
  | { id: string; at: number; type: 'support'; fromTownId: string; toTownId: string; portion: number }
  | { id: string; at: number; type: 'relief'; fromTownId: string; toTownId: string; portion: number }
  | { id: string; at: number; type: 'sally'; townId: string }
  | { id: string; at: number; type: 'aid'; townId: string }
  | { id: string; at: number; type: 'dodge'; fromTownId: string; toTownId: string }

export interface Owner {
  id: string
  name: string
  kind: 'player' | 'bot' | 'barbarian'
  personality: Personality | null
  difficulty: Difficulty | null
  schedule: BotSchedule | null
  traits: BotTraits | null
  nextLoginAt: number | null
  lastLoginAt: number | null
  sessionEndsAt: number | null
  /** Set when an alarm pulled the next login forward. Cleared once they sit up. */
  wokenByAlert?: boolean
  orders: BotOrder[]
}

export interface BuildJob {
  buildingId: BuildingId
  targetLevel: number
  completesAt: number | null
  cost: Resources
}

export interface RecruitJob {
  unitId: UnitId
  remaining: number
  perUnitMs: number
  nextAt: number
}

export interface ResearchJob {
  unitId: UnitId
  targetLevel: number
  completesAt: number
  cost: Resources
}

export interface SupportGroup {
  id: string
  ownerId: string
  originTownId: string
  units: UnitCounts
}

export interface Siege {
  id: string
  townId: string
  attackerOwnerId: string
  originTownId: string
  units: UnitCounts
  startedAt: number
  endsAt: number
}

export interface AidCall {
  id: string
  townId: string
  ownerId: string
  askedAt: number
  expiresAt: number
}

export interface Town {
  id: string
  name: string
  x: number
  y: number
  ownerId: string
  /** 1 normally. Raised while a siege camp sits outside, and applied to new build and train times. */
  workPace: number
  buildings: Record<BuildingId, number>
  buildQueue: BuildJob[]
  resources: Resources
  resourcesAt: number
  units: UnitCounts
  support: SupportGroup[]
  recruitQueues: Record<TrainBuilding, RecruitJob | null>
  research: Partial<Record<UnitId, number>>
  researchJob: ResearchJob | null
}

export interface Movement {
  id: string
  ownerId: string
  originTownId: string
  targetTownId: string
  mission: Mission
  units: UnitCounts
  resources: Resources
  departsAt: number
  arrivesAt: number
  travelMs: number
  catapultTarget: BuildingId | null
  tradeDelivered: boolean
  returnsAt: number | null
  merchantCount: number
}

export interface UnitLine {
  id: UnitId
  sent: number
  lost: number
}

export interface BattleView {
  attackerName: string
  defenderName: string
  attackerTown: string
  defenderTown: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  luck: number
  attackerWins: boolean
  attackerUnits: UnitLine[]
  defenderUnits: UnitLine[]
  loot: Resources
  wallBefore: number
  wallAfter: number
  buildingTarget: BuildingId | null
  buildingBefore: number
  buildingAfter: number
  invested: boolean
  siegeEndsAt: number | null
}

export interface ScoutView {
  success: boolean
  townId: string
  townName: string
  ownerName: string
  x: number
  y: number
  resources: Resources | null
  buildings: Record<BuildingId, number> | null
  units: UnitCounts | null
  points: number | null
}

export interface Report {
  id: string
  ownerId: string
  at: number
  unread: boolean
  kind: 'battle' | 'scout' | 'support' | 'return' | 'siege' | 'trade' | 'system'
  title: string
  summary: string
  townId: string | null
  battle?: BattleView
  scout?: ScoutView
  trade?: { delivered: Resources; spilled: Resources; targetName: string }
  siegeEndsAt?: number | null
}

export type BotClockMode = 'real' | 'compressed'

export interface GameState {
  version: 3
  seed: number
  rngState: number
  speed: number
  /**
   * `real`: bot sleep, work, check-ins, and reaction delays use wall-clock time.
   * `compressed`: those same intervals run on the game clock, for tests and Blitz.
   */
  botClock: BotClockMode
  gameTime: number
  lastRealMs: number
  /** Set only while advance() is stepping. Lets alerts use the real instant that matches the current game time. */
  clockAnchor?: { game: number; real: number; speed: number } | null
  mapWidth: number
  mapHeight: number
  terrainSeed: number
  nextId: number
  playerId: string
  selectedTownId: string
  defeated: boolean
  owners: Owner[]
  towns: Town[]
  movements: Movement[]
  sieges: Siege[]
  aidCalls: AidCall[]
  reports: Report[]
}

export function nid(state: GameState, prefix: string): string {
  state.nextId += 1
  return `${prefix}${state.nextId}`
}
