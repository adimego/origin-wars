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
  loyalty: {
    minDrop: 28,
    maxDrop: 40,
    regenPerHour: 0.85,
    start: 100,
    afterConquest: 25,
  },
}
