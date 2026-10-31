import type { BuildingId, UnitId } from './ids.ts'

export type Personality = 'farmer' | 'raider' | 'defender' | 'expander'
export type Difficulty = 'easy' | 'normal' | 'hard'
export type Chronotype = 'early_bird' | 'daytime' | 'night_owl'

export interface BusyWindow {
  startHour: number
  endHour: number
}

/**
 * Human-schedule parameters. Times are real minutes on the wall clock
 * (each bot's own time zone). World speed does not shrink sleep or reaction
 * delay. When bot hours are set to compressed, the same numbers run on the
 * game clock instead, for tests and quick play.
 */
export const AI_CONFIG = {
  timezone: { min: -11, max: 12 },
  sleepJitterHours: 0.65,
  sleepDuration: { min: 6.5, max: 9.5 },
  busyJitterHours: 0.4,
  /** Chance to keep only a short single work block (part-time, errands). */
  partTimeChance: 0.22,
  chronotypes: {
    early_bird: {
      sleepStart: 21.5,
      sleepEnd: 5.25,
      busy: [
        { startHour: 8, endHour: 12 },
        { startHour: 13, endHour: 16.5 },
      ] as BusyWindow[],
    },
    daytime: {
      sleepStart: 23.25,
      sleepEnd: 7.25,
      busy: [
        { startHour: 9, endHour: 12 },
        { startHour: 13, endHour: 17 },
      ] as BusyWindow[],
    },
    night_owl: {
      sleepStart: 1.75,
      sleepEnd: 9.75,
      busy: [
        { startHour: 12, endHour: 14.5 },
        { startHour: 16.5, endHour: 21 },
      ] as BusyWindow[],
    },
  },
  /** Weights are relative. Farmers rise early. Raiders keep late hours. */
  chronotypeWeights: {
    farmer: { early_bird: 0.6, daytime: 0.3, night_owl: 0.1 },
    raider: { early_bird: 0.12, daytime: 0.28, night_owl: 0.6 },
    defender: { early_bird: 0.4, daytime: 0.48, night_owl: 0.12 },
    expander: { early_bird: 0.25, daytime: 0.5, night_owl: 0.25 },
  } as Record<Personality, Record<Chronotype, number>>,
  intervals: {
    activeMeanMin: 52,
    busyMeanMin: 200,
    minGapMin: 16,
    /** Multiplier is uniform in [1-jitter, 1+jitter]. */
    jitter: 0.48,
  },
  /** Divides into the check interval. Higher means fewer visits. */
  activityScale: {
    farmer: 1.32,
    raider: 0.76,
    defender: 1.08,
    expander: 0.94,
  } as Record<Personality, number>,
  difficultyIntervalScale: {
    easy: 1.45,
    normal: 1,
    hard: 0.7,
  } as Record<Difficulty, number>,
  /** Odds of a brief night waking instead of sleeping through. */
  sleepCheck: { easy: 0.03, normal: 0.07, hard: 0.12 } as Record<Difficulty, number>,
  sleepCheckDelayMin: [30, 110] as [number, number],
  /** Extra drowsy delay after the sleep window ends. */
  wakeDelayMin: [12, 48] as [number, number],
  /** How long they stay once they sit down, in schedule minutes [min, max]. */
  sessionsMin: {
    active: [12, 34] as [number, number],
    busy: [2, 7] as [number, number],
    sleep: [1, 3] as [number, number],
  },
  /** Delay from sitting down to the first order. Never zero. */
  reactionMin: {
    easy: [8, 24] as [number, number],
    normal: [3, 14] as [number, number],
    hard: [2, 7] as [number, number],
  },
  notice: { sleep: 0.15, busy: 0.45, active: 0.84 },
  /** Added to notice chance and clamped so even a careful lord can miss one. */
  attention: {
    farmer: 0.02,
    raider: -0.08,
    defender: 0.1,
    expander: 0.03,
  } as Record<Personality, number>,
  mistake: { easy: 0.4, normal: 0.24, hard: 0.12 } as Record<Difficulty, number>,
  hesitation: { easy: 0.32, normal: 0.18, hard: 0.08 } as Record<Difficulty, number>,
  fickle: { easy: 0.34, normal: 0.22, hard: 0.1 } as Record<Difficulty, number>,
  clickGapMin: 2,
  traitJitter: 0.12,
  /**
   * Chance of waking for an alarm while asleep. A center per personality, then a wide
   * spread so the same type includes hardcore, casual, and in-between lords.
   */
  wakeOnAlert: {
    farmer: 0.18,
    raider: 0.5,
    defender: 0.7,
    expander: 0.36,
  } as Record<Personality, number>,
  wakeOnAlertSpread: 0.4,
  /** Real minutes from the alarm until they sit up. They can go back to sleep after. */
  alertGroggyMin: [4, 22] as [number, number],
  /** Minutes from sitting up to the first order. The groggy wait already happened. */
  alertClickMin: [1, 2] as [number, number],
  /** How long the groggy visit lasts. Long enough for one order, then the night resumes. */
  alertStayMin: [4, 9] as [number, number],
  personalities: {
    farmer: {
      attackChance: 0.2,
      dodgeChance: 0.26,
      caution: 0.5,
      minRaidPop: 22,
      maxRaidDistance: 9,
      spendReserve: 0.22,
      activeClicks: 2,
      barbarianBias: 16,
      playerBias: 1,
      weakBias: 1,
      targetNoise: 4,
      preferredUnits: ['spear', 'sword', 'axe'] as UnitId[],
      buildWeights: {
        timber: 10,
        clay: 9,
        iron: 8,
        warehouse: 7,
        farm: 7,
        headquarters: 6,
        barracks: 3,
        wall: 2,
        smithy: 2,
        market: 2,
        rally: 4,
        stable: 1,
        workshop: 0,
        academy: 0,
      },
    },
    raider: {
      attackChance: 0.7,
      dodgeChance: 0.62,
      caution: 0.22,
      minRaidPop: 10,
      maxRaidDistance: 14,
      spendReserve: 0.08,
      activeClicks: 3,
      barbarianBias: 8,
      playerBias: 16,
      weakBias: 1.2,
      targetNoise: 6,
      preferredUnits: ['axe', 'light', 'spear', 'scout'] as UnitId[],
      buildWeights: {
        barracks: 10,
        smithy: 8,
        stable: 8,
        iron: 7,
        timber: 6,
        headquarters: 6,
        clay: 5,
        farm: 5,
        warehouse: 4,
        rally: 5,
        wall: 2,
        workshop: 2,
        market: 1,
        academy: 1,
      },
    },
    defender: {
      attackChance: 0.12,
      dodgeChance: 0.16,
      caution: 0.78,
      minRaidPop: 55,
      maxRaidDistance: 7,
      spendReserve: 0.25,
      activeClicks: 2,
      barbarianBias: 6,
      playerBias: 0,
      weakBias: 0.4,
      targetNoise: 3,
      preferredUnits: ['spear', 'sword', 'heavy'] as UnitId[],
      buildWeights: {
        wall: 10,
        barracks: 8,
        farm: 7,
        timber: 6,
        clay: 6,
        iron: 6,
        headquarters: 5,
        smithy: 5,
        warehouse: 5,
        stable: 3,
        rally: 4,
        market: 1,
        workshop: 1,
        academy: 0,
      },
    },
    expander: {
      attackChance: 0.48,
      dodgeChance: 0.38,
      caution: 0.42,
      minRaidPop: 28,
      maxRaidDistance: 12,
      spendReserve: 0.12,
      activeClicks: 3,
      barbarianBias: 5,
      playerBias: 8,
      weakBias: 2.2,
      targetNoise: 5,
      preferredUnits: ['axe', 'light', 'spear', 'commander', 'ram'] as UnitId[],
      buildWeights: {
        academy: 9,
        headquarters: 8,
        barracks: 7,
        smithy: 7,
        timber: 6,
        clay: 6,
        iron: 6,
        farm: 6,
        stable: 5,
        warehouse: 5,
        workshop: 4,
        market: 3,
        wall: 3,
        rally: 4,
      },
    },
  },
}

export const PERSONALITY_LABEL: Record<Personality, string> = {
  farmer: 'Steward',
  raider: 'Raider',
  defender: 'Castellan',
  expander: 'Claimant',
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Green',
  normal: 'Seasoned',
  hard: 'Sharp',
}

export const CHRONOTYPE_LABEL: Record<Chronotype, string> = {
  early_bird: 'Early riser',
  daytime: 'Daylight hours',
  night_owl: 'Night owl',
}

export function fillWeights(
  partial: Partial<Record<BuildingId, number>>,
): Record<BuildingId, number> {
  return {
    headquarters: partial.headquarters ?? 0,
    timber: partial.timber ?? 0,
    clay: partial.clay ?? 0,
    iron: partial.iron ?? 0,
    farm: partial.farm ?? 0,
    warehouse: partial.warehouse ?? 0,
    barracks: partial.barracks ?? 0,
    stable: partial.stable ?? 0,
    workshop: partial.workshop ?? 0,
    wall: partial.wall ?? 0,
    smithy: partial.smithy ?? 0,
    market: partial.market ?? 0,
    rally: partial.rally ?? 0,
    academy: partial.academy ?? 0,
  }
}
