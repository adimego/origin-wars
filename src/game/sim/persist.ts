import type { GameState } from './types.ts'

const KEY = 'origin-wars-save-v2'

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // A full disk should not crash the session. The in-memory realm keeps running.
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    if (parsed.version !== 2 || !parsed.playerId || !Array.isArray(parsed.towns) || !Array.isArray(parsed.sieges)) return null
    return parsed
  } catch {
    return null
  }
}

export function clearGame(): void {
  localStorage.removeItem(KEY)
}

export function hasSave(): boolean {
  return loadGame() != null
}
