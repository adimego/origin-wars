import { describe, expect, it } from 'vitest'
import { SIEGE, WORLD } from '../config/world.ts'
import { sendArmy } from './commands.ts'
import { BUILDINGS } from '../config/buildings.ts'
import { productionPerHour } from './formulas.ts'
import { syncTownResources } from './resources.ts'
import { canInvest, holdsCamp, siegeDurationMs, siegeWeight } from './siege.ts'
import { emptyUnits, zeroUnit } from './defaults.ts'
import { addUnits } from './defaults.ts'
import { atGame, flatSchedule, focusedTraits, makeOwner, makeState, makeTown, starterBuildings } from './testkit.ts'
import { GAME_HOUR_MS, hours, minutes } from './time.ts'

describe('sieges', () => {
  it('runs longer against a larger, walled town and shorter when the camp has engines', () => {
    const hamlet = siegeDurationMs({ hq: 1, wall: 0, points: 8, weight: 0 })
    const walled = siegeDurationMs({ hq: 1, wall: 8, points: 8, weight: 0 })
    const city = siegeDurationMs({ hq: 8, wall: 8, points: 40, weight: 0 })
    const invested = siegeDurationMs({ hq: 8, wall: 8, points: 40, weight: 16 })
    expect(walled).toBeGreaterThan(hamlet)
    expect(city).toBeGreaterThan(walled)
    expect(invested).toBeLessThan(city)
    expect(hamlet).toBeGreaterThanOrEqual(SIEGE.minMinutes * 60_000)
    expect(city).toBeLessThanOrEqual(SIEGE.maxMinutes * 60_000)
    expect(city).toBeGreaterThan(hamlet * 2)
  })

  it('stays at least 20 real minutes at standard speed, even with the biggest weight cut', () => {
    const standard = 20
    const shortest = siegeDurationMs({ hq: 0, wall: 0, points: 0, weight: 10_000 })
    const hamlet = siegeDurationMs({ hq: 1, wall: 0, points: 8, weight: 10_000 })
    const realMinutes = (gameMs: number) => gameMs / standard / 60_000
    expect(realMinutes(shortest)).toBeGreaterThanOrEqual(20)
    expect(realMinutes(hamlet)).toBeGreaterThanOrEqual(20)
    expect(shortest).toBe(SIEGE.minMinutes * 60_000)
  })

  it('leaves room for a neighbor to march relief during a minimum siege', () => {
    const shortest = siegeDurationMs({ hq: 0, wall: 0, points: 0, weight: 10_000 })
    const infantryMarch = SIEGE.aidRadius * WORLD.minutesPerField * 60_000
    expect(shortest).toBeGreaterThan(infantryMarch * 2)
  })

  it('treats one commander, or three rams, as enough weight to invest', () => {
    const banner = zeroUnit('commander', 1)
    const rams = zeroUnit('ram', 3)
    const spears = zeroUnit('spear', 40)
    expect(siegeWeight(banner)).toBe(SIEGE.weight.commander)
    expect(canInvest(banner)).toBe(true)
    expect(canInvest(rams)).toBe(true)
    expect(siegeWeight(spears)).toBe(0)
    expect(canInvest(spears)).toBe(false)
    expect(holdsCamp(spears)).toBe(true)
  })

  it('wins the field, camps, and only takes the town when the clock ends', () => {
    const state = makeState()
    state.owners.push(makeOwner({ id: 'wild', kind: 'barbarian', name: 'Unclaimed' }))
    const column = zeroUnit('axe', 30)
    addUnits(column, zeroUnit('commander', 1))
    state.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        x: 0,
        y: 0,
        buildings: starterBuildings({ farm: 6, warehouse: 4 }),
        units: column,
      }),
      makeTown({
        id: 'hamlet',
        name: 'Ash wick',
        ownerId: 'wild',
        x: 0,
        y: 2,
        buildings: starterBuildings(),
        units: emptyUnits(),
        resources: { wood: 400, clay: 200, iron: 80 },
      }),
    )
    expect(sendArmy(state, 'home', 'hamlet', 'siege', column, null)).toBeNull()
    const arrival = state.movements[0]!.arrivesAt
    const camped = atGame(state, arrival)
    const hamlet = camped.towns.find((town) => town.id === 'hamlet')
    expect(hamlet?.ownerId).toBe('wild')
    expect(hamlet?.units.axe ?? 0).toBe(0)
    expect(camped.sieges).toHaveLength(1)
    expect(camped.sieges[0]?.endsAt).toBeGreaterThan(arrival)
    expect(hamlet?.workPace).toBe(SIEGE.laborFactor)
    const taken = atGame(camped, camped.sieges[0]!.endsAt)
    const held = taken.towns.find((town) => town.id === 'hamlet')
    expect(held?.ownerId).toBe('player')
    expect(held?.units.commander).toBe(1)
    expect(held?.units.axe).toBeGreaterThan(0)
    expect(taken.sieges).toHaveLength(0)
    expect(held?.workPace).toBe(1)
  })

  it('breaks when a relief force wipes the camp', () => {
    const state = makeState()
    state.owners.push(makeOwner({ id: 'wild', kind: 'barbarian', name: 'Unclaimed' }))
    const relief = zeroUnit('axe', 80)
    state.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        x: 0,
        y: 0,
        buildings: starterBuildings(),
        units: relief,
      }),
      makeTown({
        id: 'keep',
        name: 'High ford',
        ownerId: 'wild',
        x: 4,
        y: 0,
        buildings: starterBuildings({ wall: 5 }),
        units: emptyUnits(),
      }),
    )
    state.sieges.push({
      id: 'sg1',
      townId: 'keep',
      attackerOwnerId: 'bandit',
      originTownId: 'keep',
      units: zeroUnit('spear', 20),
      startedAt: 0,
      endsAt: hours(5),
    })
    state.owners.push(makeOwner({ id: 'bandit', kind: 'bot', name: 'Bandit' }))
    expect(sendArmy(state, 'home', 'keep', 'relief', relief, null)).toBeNull()
    const after = atGame(state, state.movements[0]!.arrivesAt)
    expect(after.sieges).toHaveLength(0)
    expect(after.towns.find((town) => town.id === 'keep')?.ownerId).toBe('wild')
  })

  it('cuts production while a camp sits outside', () => {
    const town = makeTown({
      id: 'mill',
      ownerId: 'wild',
      buildings: starterBuildings({ timber: 1, clay: 0, iron: 0, warehouse: 8 }),
      resources: { wood: 0, clay: 0, iron: 0 },
      resourcesAt: 0,
    })
    syncTownResources(town, GAME_HOUR_MS, SIEGE.productionFactor)
    expect(town.resources.wood).toBeCloseTo(productionPerHour(BUILDINGS.timber, 1) * SIEGE.productionFactor, 5)
  })

  it('lets a sleeping defender miss the siege entirely', () => {
    const state = makeState()
    state.gameTime = hours(2)
    const schedule = flatSchedule({
      sleepStartHour: 23,
      sleepEndHour: 7,
      busyWindows: [{ startHour: 9, endHour: 17 }],
      sleepCheckProbability: 0,
    })
    state.owners.push(
      makeOwner({
        id: 'sleeper',
        kind: 'bot',
        name: 'Nessa Crowe',
        personality: 'defender',
        difficulty: 'hard',
        schedule,
        traits: focusedTraits({ caution: 1, dodgeChance: 1 }),
        nextLoginAt: hours(8),
      }),
    )
    const camp = zeroUnit('axe', 40)
    addUnits(camp, zeroUnit('commander', 1))
    state.towns.push(
      makeTown({
        id: 'home',
        ownerId: 'player',
        x: 0,
        y: 0,
        buildings: starterBuildings(),
        units: emptyUnits(),
      }),
      makeTown({
        id: 'asleep',
        ownerId: 'sleeper',
        x: 1,
        y: 0,
        buildings: starterBuildings(),
        units: emptyUnits(),
      }),
      makeTown({
        id: 'reserve',
        ownerId: 'sleeper',
        x: 2,
        y: 0,
        buildings: starterBuildings({ barracks: 3 }),
        units: zeroUnit('spear', 40),
      }),
    )
    state.sieges.push({
      id: 'sg-sleep',
      townId: 'asleep',
      attackerOwnerId: 'player',
      originTownId: 'home',
      units: camp,
      startedAt: state.gameTime,
      endsAt: state.gameTime + minutes(40),
    })
    const after = atGame(state, state.gameTime + minutes(40))
    expect(after.towns.find((town) => town.id === 'asleep')?.ownerId).toBe('player')
    expect(after.movements.some((movement) => movement.ownerId === 'sleeper')).toBe(false)
    expect(after.owners.find((owner) => owner.id === 'sleeper')?.orders ?? []).toHaveLength(0)
  })
})
