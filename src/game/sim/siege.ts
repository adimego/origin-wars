import type { Personality } from '../config/ai.ts'
import { SIEGE } from '../config/world.ts'
import { popOf, townPoints } from './formulas.ts'
import { GAME_MINUTE_MS } from './time.ts'
import type { GameState, Town, UnitCounts } from './types.ts'

export function siegeWeight(units: UnitCounts): number {
  return units.ram * SIEGE.weight.ram + units.catapult * SIEGE.weight.catapult + units.commander * SIEGE.weight.commander
}

export function holdsCamp(units: UnitCounts): boolean {
  return popOf(units) >= SIEGE.minHoldPop
}

/** After a won battle, this column is large enough and heavy enough to invest. */
export function canInvest(units: UnitCounts): boolean {
  return holdsCamp(units) && siegeWeight(units) >= SIEGE.minWeight
}

export function siegeDurationMs(input: { hq: number; wall: number; points: number; weight: number }): number {
  const raw =
    SIEGE.baseMinutes +
    input.hq * SIEGE.minutesPerHq +
    input.wall * SIEGE.minutesPerWall +
    input.points * SIEGE.minutesPerPoint
  const shorten = Math.min(SIEGE.maxShorten, Math.max(0, input.weight) * SIEGE.shortenPerWeight)
  const minutes = Math.min(SIEGE.maxMinutes, Math.max(SIEGE.minMinutes, raw * (1 - shorten)))
  return Math.round(minutes * GAME_MINUTE_MS)
}

export function durationForTown(town: Town, weight: number): number {
  return siegeDurationMs({
    hq: town.buildings.headquarters,
    wall: town.buildings.wall,
    points: townPoints(town),
    weight,
  })
}

export function siegeOn(state: GameState, townId: string) {
  return state.sieges.find((siege) => siege.townId === townId) ?? null
}

export function productionFactorFor(state: GameState, townId: string): number {
  return siegeOn(state, townId) ? SIEGE.productionFactor : 1
}

export function aidChanceFor(personality: Personality): number {
  return SIEGE.aidChance[personality]
}

/** Slow the jobs already on the books. New jobs read town.workPace. */
export function stretchLabor(town: Town, now: number): void {
  const factor = SIEGE.laborFactor
  const build = town.buildQueue[0]
  if (build?.completesAt != null && build.completesAt > now) {
    build.completesAt = now + Math.round((build.completesAt - now) * factor)
  }
  for (const key of ['barracks', 'stable', 'workshop', 'academy'] as const) {
    const job = town.recruitQueues[key]
    if (!job) continue
    if (job.nextAt > now) job.nextAt = now + Math.round((job.nextAt - now) * factor)
    job.perUnitMs = Math.max(1, Math.round(job.perUnitMs * factor))
  }
  if (town.researchJob && town.researchJob.completesAt > now) {
    town.researchJob.completesAt = now + Math.round((town.researchJob.completesAt - now) * factor)
  }
}
