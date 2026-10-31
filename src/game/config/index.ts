import { AI_CONFIG } from './ai.ts'
import { BUILDINGS } from './buildings.ts'
import { COMBAT, WORLD } from './world.ts'
import { UNITS } from './units.ts'

export const BALANCE = {
  buildings: BUILDINGS,
  units: UNITS,
  world: WORLD,
  combat: COMBAT,
  ai: AI_CONFIG,
}

export type Balance = typeof BALANCE
