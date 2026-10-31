import { GAME_DAY_MS, GAME_HOUR_MS, GAME_MINUTE_MS } from '@/game/sim/time.ts'
import { projectGameTime } from '@/game/sim/engine.ts'
import type { GameState } from '@/game/sim/types.ts'

export function formatCount(value: number): string {
  return Math.floor(value).toLocaleString('en-US')
}

export function formatRate(value: number): string {
  if (value >= 100) return Math.round(value).toString()
  if (value >= 10) return value.toFixed(0)
  return value.toFixed(1)
}

export function formatReal(ms: number): string {
  const safe = Math.max(0, ms)
  const total = Math.ceil(safe / 1000)
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainMin = minutes % 60
  if (hours < 48) return remainMin ? `${hours}h ${remainMin}m` : `${hours}h`
  const days = Math.floor(hours / 24)
  const remainH = hours % 24
  return remainH ? `${days}d ${remainH}h` : `${days}d`
}

export function gameClock(gameTime: number): string {
  const day = Math.floor(gameTime / GAME_DAY_MS) + 1
  const tod = ((gameTime % GAME_DAY_MS) + GAME_DAY_MS) % GAME_DAY_MS
  const hour = Math.floor(tod / GAME_HOUR_MS)
  const minute = Math.floor((tod % GAME_HOUR_MS) / GAME_MINUTE_MS)
  return `Day ${day} · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function clockNow(state: GameState, realNow: number): string {
  return gameClock(projectGameTime(state, realNow))
}

export function realLeft(state: GameState, realNow: number, at: number): number {
  return Math.max(0, (at - projectGameTime(state, realNow)) / state.speed)
}

export function coords(x: number, y: number): string {
  return `${x}|${y}`
}
