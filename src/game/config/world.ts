export interface SpeedPreset {
  id: string
  speed: number
  label: string
  detail: string
}

/** World clock multipliers. They are not a shop. One setting for the whole realm. */
export const SPEED_PRESETS: SpeedPreset[] = [
  {
    id: 'relaxed',
    speed: 5,
    label: 'Relaxed',
    detail: 'Builds linger. A neighbor’s march is something you come back to.',
  },
  {
    id: 'standard',
    speed: 20,
    label: 'Standard',
    detail: 'A nearby raid resolves in a few minutes. Conquest is an evening’s work.',
  },
  {
    id: 'blitz',
    speed: 120,
    label: 'Blitz',
    detail: 'The clock runs hot, for learning the map or pushing a conquest.',
  },
]

export const WORLD = {
  mapWidth: 36,
  mapHeight: 36,
  minTownSpacing: 4,
  /** Euclidean minutes per field before unit speed. Spear speed 1 uses this raw. */
  minutesPerField: 8,
  /** Build duration is divided by this raised to the headquarters level. */
  hqTimeFactor: 1.05,
  /** Each barracks/stable/workshop level after the first shortens training. */
  trainLevelFactor: 1.08,
  queueBase: 2,
  queueExtraEveryHq: 5,
  queueMax: 5,
  /** Cancel an in-progress building and recover this fraction of the cost. */
  activeCancelRefund: 0.8,
  minActionMs: 1000,
  emptyStorage: 400,
  emptyPopulation: 40,
  startResources: { wood: 520, clay: 480, iron: 400 },
  /** Realm clock starts on the morning of day 1 so schedules are readable. */
  startHour: 8,
  botCount: 12,
  barbarianCount: 12,
  nearbyAbandoned: 3,
  reportCap: 120,
  market: {
    loss: 0.25,
    carry: 500,
    speed: 1.6,
    minShipment: 50,
  },
}

export const COMBAT = {
  /** Symmetric luck swing applied to attack power. 0.15 means ±15%. */
  luckRange: 0.15,
  lossExponent: 1.5,
  /** Defense is multiplied by this raised to the wall level. */
  wallMultiplierPerLevel: 1.045,
  ramAttack: 40,
  ramWallResist: 50,
  catapultAttack: 80,
  catapultResist: 90,
  /** Full scout report when scout attack is at least this times scout defense. */
  scoutInfoRatio: 2,
  /** Each smithy level multiplies that unit’s combat stats. */
  researchBonusPerLevel: 0.08,
}

/**
 * Sieges are how a town changes hands. Win the field, then hold a camp
 * until the clock runs out. All times are game-minutes.
 */
export const SIEGE = {
  baseMinutes: 28,
  minutesPerHq: 5,
  minutesPerWall: 7,
  minutesPerPoint: 0.6,
  minMinutes: 18,
  maxMinutes: 180,
  /** Each point of siege weight shortens the clock by this fraction. */
  shortenPerWeight: 0.025,
  maxShorten: 0.5,
  weight: { ram: 1, catapult: 2, commander: 4 },
  /** Weight required, after the battle, to invest the town. */
  minWeight: 3,
  /** Population that must still be in the camp to keep or finish the siege. */
  minHoldPop: 12,
  /** Fields and pits produce this fraction of normal while invested. */
  productionFactor: 0.3,
  /** New construction and training take this many times longer. */
  laborFactor: 2.5,
  aidRadius: 14,
  aidChance: { farmer: 0.4, raider: 0.1, defender: 0.72, expander: 0.22 },
  /** Chance a bot who could raid will try to invest instead, if they have the weight. */
  siegeChance: { farmer: 0.08, raider: 0.38, defender: 0.06, expander: 0.72 },
}
