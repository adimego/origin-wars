import { describe, expect, it } from 'vitest'
import { buildingTier } from './town-tier.ts'

describe('buildingTier', () => {
  it('treats level 0 as an empty plot', () => {
    expect(buildingTier(0, 20)).toBe(0)
    expect(buildingTier(0, 1)).toBe(0)
  })

  it('splits a full building into wood, stone, and grand', () => {
    expect(buildingTier(1, 20)).toBe(1)
    expect(buildingTier(6, 20)).toBe(1)
    expect(buildingTier(7, 20)).toBe(2)
    expect(buildingTier(13, 20)).toBe(2)
    expect(buildingTier(14, 20)).toBe(3)
    expect(buildingTier(20, 20)).toBe(3)
  })

  it('still shows every tier when the cap is short', () => {
    expect(buildingTier(1, 3)).toBe(1)
    expect(buildingTier(2, 3)).toBe(2)
    expect(buildingTier(3, 3)).toBe(3)
    expect(buildingTier(4, 12)).toBe(1)
    expect(buildingTier(8, 12)).toBe(2)
    expect(buildingTier(12, 12)).toBe(3)
  })

  it('keeps a one-level building at the built wooden tier', () => {
    expect(buildingTier(1, 1)).toBe(1)
  })
})
