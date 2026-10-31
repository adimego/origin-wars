import { AI_CONFIG, fillWeights, type Difficulty, type Personality } from '../config/ai.ts'
import { clamp, type Rng } from './rng.ts'
import { rollBotSchedule } from './schedule.ts'
import type { BotSchedule, BotTraits } from './types.ts'

function jitter(value: number, rng: Rng, amount: number): number {
  return value * (1 + (rng() * 2 - 1) * amount)
}

export function rollTraits(personality: Personality, difficulty: Difficulty, rng: Rng): BotTraits {
  const base = AI_CONFIG.personalities[personality]
  const spread = AI_CONFIG.traitJitter
  return {
    attackChance: clamp(jitter(base.attackChance, rng, spread), 0, 0.92),
    dodgeChance: clamp(jitter(base.dodgeChance, rng, spread), 0, 0.9),
    caution: clamp(jitter(base.caution, rng, spread), 0, 0.95),
    minRaidPop: Math.max(4, Math.round(jitter(base.minRaidPop, rng, spread))),
    maxRaidDistance: Math.max(4, base.maxRaidDistance + Math.round((rng() * 2 - 1) * 1)),
    spendReserve: clamp(jitter(base.spendReserve, rng, spread), 0, 0.45),
    activeClicks: base.activeClicks,
    attention: AI_CONFIG.attention[personality],
    mistakeChance: AI_CONFIG.mistake[difficulty],
    hesitation: AI_CONFIG.hesitation[difficulty],
    fickle: AI_CONFIG.fickle[difficulty],
    barbarianBias: base.barbarianBias,
    playerBias: base.playerBias,
    weakBias: base.weakBias,
    targetNoise: base.targetNoise,
    preferredUnits: [...base.preferredUnits],
    buildWeights: fillWeights(base.buildWeights),
    targetStyle: personality,
  }
}

export function rollBot(personality: Personality, difficulty: Difficulty, rng: Rng): { schedule: BotSchedule; traits: BotTraits } {
  return {
    schedule: rollBotSchedule(personality, difficulty, rng),
    traits: rollTraits(personality, difficulty, rng),
  }
}
