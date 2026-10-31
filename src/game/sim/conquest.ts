import { COMBAT } from '../config/world.ts'
import { GAME_HOUR_MS } from './time.ts'

export function loyaltyAt(loyalty: number, loyaltyStamp: number, gameTime: number, regenPerHour = COMBAT.loyalty.regenPerHour): number {
  if (gameTime <= loyaltyStamp) return Math.min(100, loyalty)
  const gained = ((gameTime - loyaltyStamp) / GAME_HOUR_MS) * regenPerHour
  return Math.min(100, loyalty + gained)
}

export function applyNobleImpact(
  loyalty: number,
  drops: number[],
): { loyalty: number; reduction: number; conquered: boolean } {
  let next = loyalty
  let reduction = 0
  for (const drop of drops) {
    reduction += drop
    next -= drop
  }
  return { loyalty: next, reduction, conquered: next <= 0 }
}

export function rollLoyaltyDrop(rng: () => number): number {
  const { minDrop, maxDrop } = COMBAT.loyalty
  return minDrop + Math.floor(rng() * (maxDrop - minDrop + 1))
}
