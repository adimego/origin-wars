import { makeRng } from './rng.ts'
import { nextLoginAt } from './schedule.ts'
import type { GameState } from './types.ts'

const KEY = 'origin-wars-save-v3'
const PREVIOUS_KEY = 'origin-wars-save-v2'

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // A full disk should not crash the session. The in-memory realm keeps running.
  }
}

function migrate(parsed: Omit<GameState, 'version' | 'botClock'> & { version: number; botClock?: GameState['botClock'] }): GameState | null {
  if (!parsed.playerId || !Array.isArray(parsed.towns) || !Array.isArray(parsed.sieges)) return null
  if (parsed.version !== 2 && parsed.version !== 3) return null
  if (parsed.version === 2 || !parsed.botClock) {
    parsed.version = 3
    parsed.botClock = 'real'
    const now = Date.now()
    for (const owner of parsed.owners ?? []) {
      if (owner.kind !== 'bot' || !owner.schedule) continue
      owner.orders = []
      owner.lastLoginAt = null
      owner.sessionEndsAt = null
      owner.nextLoginAt = nextLoginAt(owner.schedule, now, makeRng(parsed))
    }
  }
  return parsed as GameState
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(PREVIOUS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    return migrate(parsed)
  } catch {
    return null
  }
}

export function clearGame(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem(PREVIOUS_KEY)
}

export function hasSave(): boolean {
  return loadGame() != null
}
