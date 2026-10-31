import { describe, expect, it } from 'vitest'
import { emptyBuildings, emptyUnits, zeroUnit } from './defaults.ts'
import { resolveCombat, resolveScout, wallLevelsLost } from './combat.ts'
import { addUnits } from './defaults.ts'

function fight(attackers: ReturnType<typeof emptyUnits>, defenders: ReturnType<typeof emptyUnits>, extra?: {
  wall?: number
  resources?: { wood: number; clay: number; iron: number }
  buildings?: ReturnType<typeof emptyBuildings>
  catapultTarget?: 'timber' | 'wall' | null
}) {
  const buildings = extra?.buildings ?? emptyBuildings()
  if (extra?.wall != null) buildings.wall = extra.wall
  return resolveCombat({
    attackers: { units: attackers, research: {} },
    defenders: { units: defenders, research: {} },
    wall: buildings.wall,
    buildings,
    resources: extra?.resources ?? { wood: 0, clay: 0, iron: 0 },
    luck: 0,
    catapultTarget: extra?.catapultTarget ?? null,
  })
}

describe('combat', () => {
  it('lets a larger force win, wipe the garrison, and loot up to carrying capacity', () => {
    const axes = zeroUnit('axe', 100)
    const spears = zeroUnit('spear', 10)
    const result = fight(axes, spears, { resources: { wood: 500, clay: 500, iron: 500 } })
    expect(result.attackerWins).toBe(true)
    expect(result.defenderRemaining.spear).toBe(0)
    expect(result.attackerRemaining.axe).toBe(99)
    expect(result.loot).toEqual({ wood: 330, clay: 330, iron: 330 })
  })

  it('gives the wall enough weight to flip the same battle', () => {
    const axes = zeroUnit('axe', 40)
    const spears = zeroUnit('spear', 80)
    const open = fight(axes, spears)
    const walled = fight(axes, spears, { wall: 10 })
    expect(open.attackerWins).toBe(true)
    expect(open.defenderRemaining.spear).toBe(0)
    expect(open.attackerRemaining.axe).toBe(14)
    expect(walled.attackerWins).toBe(false)
    expect(walled.attackerRemaining.axe).toBe(0)
    expect(walled.defenderRemaining.spear).toBe(16)
    expect(walled.loot).toEqual({ wood: 0, clay: 0, iron: 0 })
  })

  it('makes spears punish cavalry and swords punish less of it', () => {
    const cavalry = zeroUnit('light', 20)
    const againstSpears = fight(cavalry, zeroUnit('spear', 100))
    const againstSwords = fight(cavalry, zeroUnit('sword', 100))
    expect(againstSpears.attackerWins).toBe(false)
    expect(againstSpears.attackerRemaining.light).toBe(0)
    expect(againstSwords.attackerWins).toBe(true)
    expect(againstSwords.defenderRemaining.sword).toBe(0)
    expect(againstSwords.attackerRemaining.light).toBe(11)
  })

  it('knocks wall levels down with surviving rams and buildings with catapults', () => {
    expect(wallLevelsLost(30, 8)).toBe(2)
    const rams = emptyUnits()
    addUnits(rams, zeroUnit('axe', 200))
    addUnits(rams, zeroUnit('ram', 30))
    const rammed = fight(rams, zeroUnit('spear', 1), { wall: 8 })
    expect(rammed.attackerWins).toBe(true)
    expect(rammed.attackerRemaining.ram).toBe(30)
    expect(rammed.wallAfter).toBe(6)

    const siege = emptyUnits()
    addUnits(siege, zeroUnit('axe', 200))
    addUnits(siege, zeroUnit('catapult', 40))
    const buildings = emptyBuildings()
    buildings.timber = 5
    const smashed = fight(siege, zeroUnit('spear', 1), { buildings, catapultTarget: 'timber' })
    expect(smashed.attackerWins).toBe(true)
    expect(smashed.buildingAfter).toBe(0)
  })

  it('reports a clean scout against an empty town and a failure against a real garrison', () => {
    const success = resolveScout({
      attackers: { units: zeroUnit('scout', 10), research: {} },
      defenders: { units: emptyUnits(), research: {} },
    })
    expect(success.success).toBe(true)
    expect(success.revealed).toBe('full')
    expect(success.attackerRemaining.scout).toBe(10)

    const failure = resolveScout({
      attackers: { units: zeroUnit('scout', 10), research: {} },
      defenders: { units: zeroUnit('spear', 100), research: {} },
    })
    expect(failure.success).toBe(false)
    expect(failure.revealed).toBe('none')
    expect(failure.attackerRemaining.scout).toBe(0)

    const partial = resolveScout({
      attackers: { units: zeroUnit('scout', 10), research: {} },
      defenders: { units: zeroUnit('spear', 3), research: {} },
    })
    expect(partial.success).toBe(true)
    expect(partial.revealed).toBe('partial')
    expect(partial.attackerRemaining.scout).toBe(5)
  })

  it('makes smithy research hit harder', () => {
    const plain = fight(zeroUnit('axe', 40), zeroUnit('spear', 80))
    const veteran = resolveCombat({
      attackers: { units: zeroUnit('axe', 40), research: { axe: 3 } },
      defenders: { units: zeroUnit('spear', 80), research: {} },
      wall: 0,
      buildings: emptyBuildings(),
      resources: { wood: 0, clay: 0, iron: 0 },
      luck: 0,
      catapultTarget: null,
    })
    expect(veteran.attackerRemaining.axe).toBeGreaterThan(plain.attackerRemaining.axe)
  })
})
