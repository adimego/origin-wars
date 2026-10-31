export const RESOURCE_KEYS = ['wood', 'clay', 'iron'] as const
export type ResourceKey = (typeof RESOURCE_KEYS)[number]
export type Resources = Record<ResourceKey, number>

export const BUILDING_IDS = [
  'headquarters',
  'timber',
  'clay',
  'iron',
  'farm',
  'warehouse',
  'barracks',
  'stable',
  'workshop',
  'wall',
  'smithy',
  'market',
  'rally',
  'academy',
] as const
export type BuildingId = (typeof BUILDING_IDS)[number]

export const UNIT_IDS = [
  'spear',
  'sword',
  'axe',
  'scout',
  'light',
  'heavy',
  'ram',
  'catapult',
  'commander',
] as const
export type UnitId = (typeof UNIT_IDS)[number]

export const TRAIN_BUILDINGS = ['barracks', 'stable', 'workshop', 'academy'] as const
export type TrainBuilding = (typeof TRAIN_BUILDINGS)[number]

export function res(wood: number, clay: number, iron: number): Resources {
  return { wood, clay, iron }
}
