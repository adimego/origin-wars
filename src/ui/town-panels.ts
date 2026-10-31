import { UNIT_IDS, type BuildingId, type TrainBuilding, type UnitId } from '@/game/config/ids.ts'
import { UNITS } from '@/game/config/units.ts'

export type TownPanel = 'research' | 'recruit' | 'market' | 'rally'

/** What a town-view click should open besides construction. */
export function townPanel(id: BuildingId): TownPanel | null {
  if (id === 'smithy') return 'research'
  if (id === 'barracks' || id === 'stable' || id === 'workshop' || id === 'academy') return 'recruit'
  if (id === 'market') return 'market'
  if (id === 'rally') return 'rally'
  return null
}

export function researchableUnits(): UnitId[] {
  return UNIT_IDS.filter((id) => UNITS[id].researchMax > 0)
}

export function unitsAt(building: TrainBuilding): UnitId[] {
  return UNIT_IDS.filter((id) => UNITS[id].trainBuilding === building)
}
