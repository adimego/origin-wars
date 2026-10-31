import { describe, expect, it } from 'vitest'
import { COMBAT } from '../config/world.ts'
import { sendArmy } from './commands.ts'
import { applyNobleImpact, loyaltyAt } from './conquest.ts'
import { emptyUnits, zeroUnit } from './defaults.ts'
import { addUnits } from './defaults.ts'
import { atGame, makeOwner, makeState, makeTown, starterBuildings } from './testkit.ts'
import { GAME_HOUR_MS } from './time.ts'

describe('conquest', () => {
  it('regenerates loyalty toward 100 and stops there', () => {
    expect(loyaltyAt(80, 0, 10 * GAME_HOUR_MS, 1)).toBeCloseTo(90, 5)
    expect(loyaltyAt(90, 0, 30 * GAME_HOUR_MS, 1)).toBe(100)
    expect(loyaltyAt(40, 5 * GAME_HOUR_MS, 5 * GAME_HOUR_MS, 1)).toBe(40)
  })

  it('drops loyalty per noble and conquers only at zero', () => {
    const scratched = applyNobleImpact(50, [30])
    expect(scratched.conquered).toBe(false)
    expect(scratched.loyalty).toBe(20)
    expect(scratched.reduction).toBe(30)

    const fallen = applyNobleImpact(100, [40, 40, 40])
    expect(fallen.conquered).toBe(true)
    expect(fallen.loyalty).toBeLessThanOrEqual(0)
  })

  it('hands the town over when a surviving noble breaks loyalty, and not otherwise', () => {
    const state = makeState()
    state.owners.push(makeOwner({ id: 'wild', kind: 'barbarian', name: 'Unclaimed' }))
    const axes = zeroUnit('axe', 40)
    addUnits(axes, zeroUnit('noble', 1))
    state.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        x: 0,
        y: 0,
        buildings: starterBuildings({ farm: 8, warehouse: 6 }),
        units: axes,
        resources: { wood: 100, clay: 100, iron: 100 },
      }),
      makeTown({
        id: 'hamlet',
        name: 'Ash wick',
        ownerId: 'wild',
        x: 0,
        y: 3,
        loyalty: 10,
        buildings: starterBuildings(),
        units: emptyUnits(),
        resources: { wood: 400, clay: 200, iron: 50 },
      }),
    )
    expect(sendArmy(state, 'home', 'hamlet', 'attack', axes, null)).toBeNull()
    const arrival = state.movements[0]!.arrivesAt
    const fought = atGame(state, arrival)
    const hamlet = fought.towns.find((town) => town.id === 'hamlet')
    expect(hamlet?.ownerId).toBe('player')
    expect(hamlet?.units.noble).toBe(0)
    expect(hamlet?.units.axe).toBeGreaterThan(0)
    expect(hamlet?.loyalty).toBe(COMBAT.loyalty.afterConquest)
    expect(fought.towns.find((town) => town.id === 'home')?.units.axe).toBe(0)
    expect(fought.reports.some((report) => report.kind === 'conquest' && report.ownerId === 'player')).toBe(true)

    const held = makeState()
    held.owners.push(makeOwner({ id: 'wild', kind: 'barbarian', name: 'Unclaimed' }))
    held.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        buildings: starterBuildings(),
        units: zeroUnit('noble', 1),
      }),
      makeTown({
        id: 'keep',
        ownerId: 'wild',
        x: 2,
        y: 0,
        loyalty: 100,
        buildings: starterBuildings({ barracks: 5, wall: 5 }),
        units: zeroUnit('sword', 400),
      }),
    )
    expect(sendArmy(held, 'home', 'keep', 'attack', zeroUnit('noble', 1), null)).toBeNull()
    const after = atGame(held, held.movements[0]!.arrivesAt)
    const keep = after.towns.find((town) => town.id === 'keep')
    expect(keep?.ownerId).toBe('wild')
    expect(keep?.loyalty).toBe(100)
    expect(keep?.units.sword).toBe(400)
  })
})
