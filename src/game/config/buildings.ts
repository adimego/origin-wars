import type { BuildingId, Resources } from './ids.ts'
import { res } from './ids.ts'

export interface BuildingDef {
  id: BuildingId
  name: string
  blurb: string
  maxLevel: number
  cost: Resources
  costFactor: number
  /** Game-time for level 1, before the headquarters discount. */
  timeBaseMs: number
  timeFactor: number
  requires: Partial<Record<BuildingId, number>>
  production?: { resource: 'wood' | 'clay' | 'iron'; basePerHour: number; growth: number }
  storage?: { base: number; growth: number }
  population?: { base: number; growth: number }
}

const M = 60_000

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  headquarters: {
    id: 'headquarters',
    name: 'Headquarters',
    blurb: 'The counting house. Higher levels shorten every other build.',
    maxLevel: 20,
    cost: res(70, 60, 50),
    costFactor: 1.46,
    timeBaseMs: 10 * M,
    timeFactor: 1.3,
    requires: {},
  },
  timber: {
    id: 'timber',
    name: 'Timber camp',
    blurb: 'Sawyers in the wood. Each level cuts more timber per hour.',
    maxLevel: 20,
    cost: res(50, 40, 28),
    costFactor: 1.42,
    timeBaseMs: 7 * M,
    timeFactor: 1.27,
    requires: {},
    production: { resource: 'wood', basePerHour: 60, growth: 1.17 },
  },
  clay: {
    id: 'clay',
    name: 'Clay pit',
    blurb: 'A wet cut in the ground. Clay for walls, pots, and bricks.',
    maxLevel: 20,
    cost: res(42, 52, 28),
    costFactor: 1.42,
    timeBaseMs: 7 * M,
    timeFactor: 1.27,
    requires: {},
    production: { resource: 'clay', basePerHour: 60, growth: 1.17 },
  },
  iron: {
    id: 'iron',
    name: 'Iron mine',
    blurb: 'A dark seam. Iron feeds spears, horseshoes, and noble coin.',
    maxLevel: 20,
    cost: res(48, 40, 55),
    costFactor: 1.42,
    timeBaseMs: 7 * M,
    timeFactor: 1.27,
    requires: {},
    production: { resource: 'iron', basePerHour: 60, growth: 1.17 },
  },
  farm: {
    id: 'farm',
    name: 'Farm',
    blurb: 'Fields and hearths. The farm is your population cap.',
    maxLevel: 20,
    cost: res(40, 48, 22),
    costFactor: 1.4,
    timeBaseMs: 6 * M,
    timeFactor: 1.25,
    requires: {},
    population: { base: 240, growth: 1.16 },
  },
  warehouse: {
    id: 'warehouse',
    name: 'Warehouse',
    blurb: 'Granaries and sheds. Production stops when this is full.',
    maxLevel: 20,
    cost: res(55, 45, 35),
    costFactor: 1.4,
    timeBaseMs: 6 * M,
    timeFactor: 1.25,
    requires: {},
    storage: { base: 1600, growth: 1.22 },
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    blurb: 'Where spears, swords, and axes are drilled. Higher levels train faster.',
    maxLevel: 20,
    cost: res(80, 60, 40),
    costFactor: 1.45,
    timeBaseMs: 8 * M,
    timeFactor: 1.28,
    requires: { headquarters: 1 },
  },
  stable: {
    id: 'stable',
    name: 'Stable',
    blurb: 'Scouts and cavalry. Horses eat time and iron.',
    maxLevel: 15,
    cost: res(140, 110, 160),
    costFactor: 1.48,
    timeBaseMs: 14 * M,
    timeFactor: 1.3,
    requires: { barracks: 2, headquarters: 3 },
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    blurb: 'Rams and catapults. Slow on the road, rude to walls.',
    maxLevel: 12,
    cost: res(180, 200, 160),
    costFactor: 1.5,
    timeBaseMs: 16 * M,
    timeFactor: 1.32,
    requires: { smithy: 1, headquarters: 4 },
  },
  wall: {
    id: 'wall',
    name: 'Wall',
    blurb: 'A ring of timber and stone. Multiplies the garrison’s defense.',
    maxLevel: 20,
    cost: res(45, 80, 30),
    costFactor: 1.46,
    timeBaseMs: 8 * M,
    timeFactor: 1.28,
    requires: { barracks: 1 },
  },
  smithy: {
    id: 'smithy',
    name: 'Smithy',
    blurb: 'Research weapons before the barracks will drill them.',
    maxLevel: 15,
    cost: res(90, 80, 110),
    costFactor: 1.48,
    timeBaseMs: 12 * M,
    timeFactor: 1.3,
    requires: { headquarters: 2, barracks: 1 },
  },
  market: {
    id: 'market',
    name: 'Market',
    blurb: 'Merchants haul goods between your towns, or swap them at a loss.',
    maxLevel: 12,
    cost: res(90, 80, 70),
    costFactor: 1.44,
    timeBaseMs: 9 * M,
    timeFactor: 1.28,
    requires: { headquarters: 2, warehouse: 1 },
  },
  rally: {
    id: 'rally',
    name: 'Rally point',
    blurb: 'The square where companies form up. Required to march.',
    maxLevel: 1,
    cost: res(40, 30, 20),
    costFactor: 1,
    timeBaseMs: 4 * M,
    timeFactor: 1,
    requires: {},
  },
  academy: {
    id: 'academy',
    name: 'Academy',
    blurb: 'Trains a noble. A surviving noble chips loyalty off a town.',
    maxLevel: 3,
    cost: res(220, 260, 200),
    costFactor: 1.55,
    timeBaseMs: 22 * M,
    timeFactor: 1.4,
    requires: { headquarters: 4, smithy: 1, barracks: 2 },
  },
}

export const BUILDING_GROUPS: { id: string; label: string; ids: BuildingId[] }[] = [
  {
    id: 'economy',
    label: 'Economy',
    ids: ['timber', 'clay', 'iron', 'farm', 'warehouse'],
  },
  {
    id: 'military',
    label: 'Military',
    ids: ['barracks', 'stable', 'workshop', 'wall', 'smithy', 'rally'],
  },
  {
    id: 'civic',
    label: 'Civic',
    ids: ['headquarters', 'market', 'academy'],
  },
]
