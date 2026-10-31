import { describe, expect, it } from 'vitest'
import { BUILDINGS } from '../config/buildings.ts'
import { productionPerHour, storageCapacity } from './formulas.ts'
import { syncTownResources } from './resources.ts'
import { GAME_HOUR_MS } from './time.ts'
import { atGame, makeState, makeTown, starterBuildings } from './testkit.ts'

describe('resource production', () => {
  it('follows the configured curve and stays at zero without a building', () => {
    const spec = BUILDINGS.timber.production!
    expect(productionPerHour(BUILDINGS.timber, 1)).toBe(spec.basePerHour)
    expect(productionPerHour(BUILDINGS.timber, 5)).toBeCloseTo(spec.basePerHour * spec.growth ** 4, 6)
    expect(productionPerHour(BUILDINGS.timber, 0)).toBe(0)
    expect(productionPerHour(BUILDINGS.timber, 5)).toBeGreaterThan(productionPerHour(BUILDINGS.timber, 1))
  })

  it('adds production for the elapsed hours and caps it at the warehouse', () => {
    const growing = makeTown({
      id: 'a',
      ownerId: 'player',
      buildings: starterBuildings({ timber: 5, warehouse: 12, clay: 0, iron: 0 }),
      resources: { wood: 0, clay: 0, iron: 0 },
      resourcesAt: 0,
    })
    syncTownResources(growing, 2 * GAME_HOUR_MS)
    const rate = productionPerHour(BUILDINGS.timber, 5)
    expect(growing.resources.wood).toBeCloseTo(rate * 2, 5)
    expect(growing.resources.clay).toBe(0)
    expect(growing.resources.iron).toBe(0)

    const capped = makeTown({
      id: 'b',
      ownerId: 'player',
      buildings: starterBuildings({ timber: 1, warehouse: 1 }),
      resources: { wood: 1500, clay: 0, iron: 0 },
      resourcesAt: 0,
    })
    syncTownResources(capped, 10 * GAME_HOUR_MS)
    expect(capped.resources.wood).toBe(storageCapacity(1))
  })

  it('keeps producing while the game is closed, using the world speed', () => {
    const state = makeState()
    state.speed = 10
    state.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        buildings: starterBuildings({ timber: 1, warehouse: 8 }),
        resources: { wood: 0, clay: 0, iron: 0 },
      }),
    )
    const next = atGame(state, 3 * GAME_HOUR_MS)
    const home = next.towns[0]
    expect(home?.resources.wood).toBeCloseTo(productionPerHour(BUILDINGS.timber, 1) * 3, 4)
  })
})
