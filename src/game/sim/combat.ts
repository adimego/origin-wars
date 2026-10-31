import { BALANCE } from '../config/index.ts'
import { BUILDING_IDS, UNIT_IDS, type BuildingId, type Resources } from '../config/ids.ts'
import { UNITS } from '../config/units.ts'
import { carryOf, researchMultiplier } from './formulas.ts'
import { floorResources } from './resources.ts'
import type { UnitCounts } from './types.ts'
import { emptyUnits } from './defaults.ts'

export interface CombatSide {
  units: UnitCounts
  research: Partial<Record<string, number>>
}

export interface CombatResult {
  attackerWins: boolean
  attack: number
  defense: number
  luck: number
  attackerLosses: UnitCounts
  defenderLosses: UnitCounts
  attackerRemaining: UnitCounts
  defenderRemaining: UnitCounts
  loot: Resources
  wallBefore: number
  wallAfter: number
  buildingTarget: BuildingId | null
  buildingBefore: number
  buildingAfter: number
}

export function unitsLost(count: number, ratio: number): number {
  if (count <= 0 || ratio <= 0) return 0
  if (ratio >= 1) return count
  return Math.min(count, Math.round(count * ratio))
}

export function applyLosses(units: UnitCounts, ratio: number): { losses: UnitCounts; remaining: UnitCounts } {
  const losses = emptyUnits()
  const remaining = emptyUnits()
  for (const id of UNIT_IDS) {
    const count = units[id] ?? 0
    const lost = unitsLost(count, ratio)
    losses[id] = lost
    remaining[id] = count - lost
  }
  return { losses, remaining }
}

export function wallLevelsLost(rams: number, wall: number): number {
  if (rams <= 0 || wall <= 0) return 0
  const power = rams * BALANCE.combat.ramAttack
  const resist = BALANCE.combat.ramWallResist * (wall + 1)
  return Math.min(wall, Math.floor(power / resist))
}

export function buildingLevelsLost(catapults: number, level: number): number {
  if (catapults <= 0 || level <= 0) return 0
  const power = catapults * BALANCE.combat.catapultAttack
  const resist = BALANCE.combat.catapultResist * (level + 1)
  return Math.min(level, Math.floor(power / resist))
}

function profile(side: CombatSide): {
  infantry: number
  cavalry: number
  defInfantry: number
  defCavalry: number
  defScout: number
} {
  let infantry = 0
  let cavalry = 0
  let defInfantry = 0
  let defCavalry = 0
  let defScout = 0
  for (const id of UNIT_IDS) {
    const count = side.units[id] ?? 0
    if (count <= 0) continue
    const unit = UNITS[id]
    const mult = researchMultiplier(side.research[id] ?? 0)
    const attack = unit.attack * mult * count
    if (unit.unitClass === 'cavalry') cavalry += attack
    else infantry += attack
    defInfantry += unit.defInfantry * mult * count
    defCavalry += unit.defCavalry * mult * count
    defScout += unit.defScout * mult * count
  }
  return { infantry, cavalry, defInfantry, defCavalry, defScout }
}

export function computeLoot(stock: Resources, capacity: number): Resources {
  const loot = { wood: 0, clay: 0, iron: 0 }
  if (capacity <= 0) return loot
  const total = stock.wood + stock.clay + stock.iron
  if (total <= 0) return loot
  if (capacity >= total) return { ...stock }
  const keys = ['wood', 'clay', 'iron'] as const
  let used = 0
  for (const key of keys) {
    loot[key] = Math.floor((stock[key] * capacity) / total)
    used += loot[key]
  }
  let rem = capacity - used
  const order = [...keys].sort((a, b) => stock[b] - stock[a] || (a < b ? -1 : 1))
  for (const key of order) {
    if (rem <= 0) break
    const room = stock[key] - loot[key]
    if (room <= 0) continue
    const take = Math.min(room, rem)
    loot[key] += take
    rem -= take
  }
  return loot
}

export function resolveCombat(input: {
  attackers: CombatSide
  defenders: CombatSide
  wall: number
  buildings: Record<BuildingId, number>
  resources: Resources
  luck: number
  catapultTarget: BuildingId | null
}): CombatResult {
  const atk = profile(input.attackers)
  const def = profile(input.defenders)
  const luckMod = 1 + input.luck
  const infantry = atk.infantry * luckMod
  const cavalry = atk.cavalry * luckMod
  const attack = infantry + cavalry
  const wallMul = BALANCE.combat.wallMultiplierPerLevel ** Math.max(0, input.wall)
  const defInfantry = def.defInfantry * wallMul
  const defCavalry = def.defCavalry * wallMul
  const defense = attack > 0 ? (infantry * defInfantry + cavalry * defCavalry) / attack : defInfantry
  const exponent = BALANCE.combat.lossExponent
  let attackerRatio = 0
  let defenderRatio = 0
  if (attack <= 0 && defense <= 0) {
    attackerRatio = 0
    defenderRatio = 0
  } else if (attack > defense) {
    attackerRatio = defense <= 0 ? 0 : (defense / attack) ** exponent
    defenderRatio = 1
  } else {
    attackerRatio = 1
    defenderRatio = attack <= 0 ? 0 : (attack / defense) ** exponent
  }
  const attackerRoll = applyLosses(input.attackers.units, attackerRatio)
  const defenderRoll = applyLosses(input.defenders.units, defenderRatio)
  const attackerWins = attack > defense
  let wallAfter = input.wall
  const target = input.catapultTarget
  let buildingBefore = target ? input.buildings[target] : 0
  let buildingAfter = buildingBefore
  if (attackerWins) {
    wallAfter = Math.max(0, input.wall - wallLevelsLost(attackerRoll.remaining.ram, input.wall))
    const cats = attackerRoll.remaining.catapult
    if (target === 'wall') {
      buildingBefore = wallAfter
      wallAfter = Math.max(0, wallAfter - buildingLevelsLost(cats, wallAfter))
      buildingAfter = wallAfter
    } else if (target && cats > 0) {
      const lost = buildingLevelsLost(cats, buildingBefore)
      buildingAfter = Math.max(target === 'headquarters' ? 1 : 0, buildingBefore - lost)
    }
  }
  const stock = floorResources(input.resources)
  const loot = attackerWins ? computeLoot(stock, carryOf(attackerRoll.remaining)) : { wood: 0, clay: 0, iron: 0 }
  return {
    attackerWins,
    attack,
    defense,
    luck: input.luck,
    attackerLosses: attackerRoll.losses,
    defenderLosses: defenderRoll.losses,
    attackerRemaining: attackerRoll.remaining,
    defenderRemaining: defenderRoll.remaining,
    loot,
    wallBefore: input.wall,
    wallAfter,
    buildingTarget: attackerWins ? target : null,
    buildingBefore,
    buildingAfter,
  }
}

export function scoutPower(units: UnitCounts, research: Partial<Record<string, number>>, attack: boolean): number {
  let total = 0
  for (const id of UNIT_IDS) {
    const count = units[id] ?? 0
    if (count <= 0) continue
    const unit = UNITS[id]
    const mult = researchMultiplier(research[id] ?? 0)
    total += (attack ? unit.scoutAttack : unit.defScout) * mult * count
  }
  return total
}

export interface ScoutResult {
  success: boolean
  revealed: 'none' | 'partial' | 'full'
  attackerLosses: UnitCounts
  attackerRemaining: UnitCounts
}

export function resolveScout(input: {
  attackers: CombatSide
  defenders: CombatSide
}): ScoutResult {
  const attack = scoutPower(input.attackers.units, input.attackers.research, true)
  const defense = scoutPower(input.defenders.units, input.defenders.research, false)
  const exponent = BALANCE.combat.lossExponent
  if (attack > defense) {
    const ratio = defense <= 0 ? 0 : (defense / attack) ** exponent
    const roll = applyLosses(input.attackers.units, ratio)
    const revealed = defense <= 0 || attack >= defense * BALANCE.combat.scoutInfoRatio ? 'full' : 'partial'
    return { success: true, revealed, attackerLosses: roll.losses, attackerRemaining: roll.remaining }
  }
  const roll = applyLosses(input.attackers.units, 1)
  return { success: false, revealed: 'none', attackerLosses: roll.losses, attackerRemaining: roll.remaining }
}

export function distributeLosses(groups: UnitCounts[], losses: UnitCounts): UnitCounts[] {
  const remaining = groups.map((group) => ({ ...group }))
  for (const id of UNIT_IDS) {
    const loss = losses[id] ?? 0
    const total = groups.reduce((sum, group) => sum + (group[id] ?? 0), 0)
    if (loss <= 0 || total <= 0) continue
    const raw = groups.map((group) => (loss * (group[id] ?? 0)) / total)
    const shares = raw.map((value) => Math.floor(value))
    let left = loss - shares.reduce((sum, value) => sum + value, 0)
    const order = raw
      .map((value, index) => ({ index, frac: value - Math.floor(value) }))
      .sort((a, b) => b.frac - a.frac || a.index - b.index)
    for (const entry of order) {
      if (left <= 0) break
      const room = (groups[entry.index][id] ?? 0) - shares[entry.index]
      if (room <= 0) continue
      shares[entry.index] += 1
      left -= 1
    }
    if (left > 0) {
      for (let index = 0; index < groups.length && left > 0; index++) {
        const room = (groups[index][id] ?? 0) - shares[index]
        const take = Math.min(room, left)
        shares[index] += take
        left -= take
      }
    }
    for (let i = 0; i < groups.length; i++) {
      remaining[i][id] = Math.max(0, (groups[i][id] ?? 0) - shares[i])
    }
  }
  return remaining
}

export function emptyBuildingsRecord(): Record<BuildingId, number> {
  const buildings = {} as Record<BuildingId, number>
  for (const id of BUILDING_IDS) buildings[id] = 0
  return buildings
}
