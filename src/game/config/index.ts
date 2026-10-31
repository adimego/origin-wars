import { AI_CONFIG } from './ai.ts'
import { BUILDINGS } from './buildings.ts'
import { COMBAT, SIEGE, WORLD } from './world.ts'
import { UNITS } from './units.ts'

export const BALANCE = {
  buildings: BUILDINGS,
  units: UNITS,
  world: WORLD,
  combat: COMBAT,
  siege: SIEGE,
  ai: AI_CONFIG,
}

export type Balance = typeof BALANCE
