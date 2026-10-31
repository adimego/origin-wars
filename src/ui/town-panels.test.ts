import { describe, expect, it } from 'vitest'
import { UNIT_IDS } from '@/game/config/ids.ts'
import { explainResearch } from '@/game/sim/recruit.ts'
import { makeTown } from '@/game/sim/testkit.ts'
import { buildingPlots } from './town-layout.ts'
import { researchableUnits, townPanel, unitsAt } from './town-panels.ts'

describe('town view special panels', () => {
  it('opens research, recruiting, the market, and the rally from their buildings', () => {
    expect(townPanel('smithy')).toBe('research')
    expect(townPanel('barracks')).toBe('recruit')
    expect(townPanel('stable')).toBe('recruit')
    expect(townPanel('workshop')).toBe('recruit')
    expect(townPanel('academy')).toBe('recruit')
    expect(townPanel('market')).toBe('market')
    expect(townPanel('rally')).toBe('rally')
    expect(townPanel('headquarters')).toBeNull()

    const placed = new Set(buildingPlots().map((plot) => plot.id))
    for (const id of ['smithy', 'barracks', 'stable', 'workshop', 'academy', 'market', 'rally'] as const) {
      expect(placed.has(id)).toBe(true)
    }
  })

  it('lists every weapon the smithy can research, and not the commander', () => {
    const ids = researchableUnits()
    expect(ids).toContain('spear')
    expect(ids).toContain('sword')
    expect(ids).toContain('axe')
    expect(ids).toContain('ram')
    expect(ids).not.toContain('commander')
    expect(ids).toHaveLength(UNIT_IDS.filter((id) => id !== 'commander').length)
    expect(unitsAt('barracks')).toEqual(['spear', 'sword', 'axe'])
    expect(unitsAt('academy')).toEqual(['commander'])
  })

  it('refuses research while the smithy is still an empty plot', () => {
    const town = makeTown({ id: 'home', ownerId: 'player', resources: { wood: 5000, clay: 5000, iron: 5000 } })
    expect(explainResearch(town, 'sword')).toBe('Build a smithy first.')
  })
})
