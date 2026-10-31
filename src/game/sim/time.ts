export const GAME_MINUTE_MS = 60_000
export const GAME_HOUR_MS = 3_600_000
export const GAME_DAY_MS = 86_400_000

export function minutes(n: number): number {
  return Math.round(n * GAME_MINUTE_MS)
}

export function hours(n: number): number {
  return Math.round(n * GAME_HOUR_MS)
}
