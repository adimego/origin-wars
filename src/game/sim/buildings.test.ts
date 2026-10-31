import { describe, expect, it } from 'vitest'
import { BUILDINGS } from '../config/buildings.ts'
import { WORLD } from '../config/world.ts'
import { enqueueBuilding, cancelLastBuild } from './buildings.ts'
import { buildCost, buildTimeMs } from './formulas.ts'
import { enqueueRecruit } from './recruit.ts'
import { atGame, makeState, makeTown, starterBuildings } from './testkit.ts'
import { emptyUnits } from './defaults.ts'

describe('build timers', () => {
  it('grows with the target level and shrinks as the headquarters rises', () => {
    expect(buildTimeMs('timber', 5, 1)).toBeGreaterThan(buildTimeMs('timber', 2, 1))
    expect(buildTimeMs('timber', 2, 10)).toBeLessThan(buildTimeMs('timber', 2, 1))
    const def = BUILDINGS.timber
    const expected = Math.max(
      WORLD.minActionMs,
      Math.round((def.timeBaseMs * def.timeFactor ** 1) / WORLD.hqTimeFactor ** 1),
    )
    expect(buildTimeMs('timber', 2, 1)).toBe(expected)
  })

  it('spends resources up front and finishes on the timer, then starts the next job', () => {
    const state = makeState()
    const town = makeTown({
      id: 'home',
      ownerId: 'player',
      buildings: starterBuildings({ warehouse: 6 }),
      resources: { wood: 5000, clay: 5000, iron: 5000 },
    })
    state.towns.push(town)
    const timberCost = buildCost('timber', 2)
    const clayCost = buildCost('clay', 2)
    expect(enqueueBuilding(state, 'home', 'timber')).toBeNull()
    expect(enqueueBuilding(state, 'home', 'clay')).toBeNull()
    const queued = state.towns[0]!
    expect(queued.buildings.timber).toBe(1)
    expect(queued.resources.wood).toBeCloseTo(5000 - timberCost.wood - clayCost.wood, 5)
    expect(queued.buildQueue[0]?.completesAt).not.toBeNull()
    expect(queued.buildQueue[1]?.completesAt).toBeNull()

    const firstDone = queued.buildQueue[0]!.completesAt!
    let next = atGame(state, firstDone - 1)
    expect(next.towns[0]?.buildings.timber).toBe(1)
    next = atGame(next, firstDone)
    expect(next.towns[0]?.buildings.timber).toBe(2)
    expect(next.towns[0]?.buildQueue[0]?.buildingId).toBe('clay')
    expect(next.towns[0]?.buildQueue[0]?.completesAt).not.toBeNull()

    const clayDone = next.towns[0]!.buildQueue[0]!.completesAt!
    next = atGame(next, clayDone)
    expect(next.towns[0]?.buildings.clay).toBe(2)
    expect(next.towns[0]?.buildQueue).toHaveLength(0)
  })

  it('refunds a waiting order in full and an active order in part', () => {
    const state = makeState()
    state.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        buildings: starterBuildings({ warehouse: 12 }),
        resources: { wood: 8000, clay: 8000, iron: 8000 },
      }),
    )
    enqueueBuilding(state, 'home', 'timber')
    enqueueBuilding(state, 'home', 'clay')
    const clayCost = buildCost('clay', 2)
    const before = state.towns[0]!.resources.wood
    expect(cancelLastBuild(state, 'home')).toBeNull()
    expect(state.towns[0]?.buildQueue).toHaveLength(1)
    expect(state.towns[0]?.resources.wood).toBeCloseTo(before + clayCost.wood, 5)

    const activeCost = state.towns[0]!.buildQueue[0]!.cost.wood
    const mid = state.towns[0]!.resources.wood
    cancelLastBuild(state, 'home')
    expect(state.towns[0]?.buildQueue).toHaveLength(0)
    expect(state.towns[0]?.resources.wood).toBeCloseTo(mid + activeCost * WORLD.activeCancelRefund, 5)
  })

  it('trains units one by one on the recruit timer', () => {
    const state = makeState()
    state.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        buildings: starterBuildings({ barracks: 1, farm: 3, warehouse: 4 }),
        resources: { wood: 2000, clay: 2000, iron: 2000 },
        units: emptyUnits(),
      }),
    )
    expect(enqueueRecruit(state, 'home', 'spear', 2)).toBeNull()
    const job = state.towns[0]!.recruitQueues.barracks!
    const step = job.perUnitMs
    let next = atGame(state, step - 1)
    expect(next.towns[0]?.units.spear).toBe(0)
    next = atGame(next, step)
    expect(next.towns[0]?.units.spear).toBe(1)
    expect(next.towns[0]?.recruitQueues.barracks?.remaining).toBe(1)
    next = atGame(next, step * 2)
    expect(next.towns[0]?.units.spear).toBe(2)
    expect(next.towns[0]?.recruitQueues.barracks).toBeNull()
  })
})
