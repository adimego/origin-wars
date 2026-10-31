import { describe, expect, it } from 'vitest'
import {
  CENTER,
  WALL_R,
  angleDelta,
  buildingPlots,
  fillerCount,
  fillerSpots,
} from './town-layout.ts'

describe('circular town layout', () => {
  const plots = buildingPlots()

  it('puts the keep at the center and the other buildings on two rings inside the wall', () => {
    const keep = plots.find((plot) => plot.id === 'headquarters')
    expect(keep).toMatchObject({ x: CENTER.x, y: CENTER.y })
    const outer = plots.filter((plot) => plot.r > 100)
    const inner = plots.filter((plot) => plot.r > 0 && plot.r < 100)
    expect(outer).toHaveLength(8)
    expect(inner).toHaveLength(4)
    for (const plot of plots) {
      if (plot.r === 0) continue
      expect(Math.hypot(plot.x - CENTER.x, plot.y - CENTER.y)).toBeCloseTo(plot.r, 5)
      expect(plot.r).toBeLessThan(WALL_R - 24)
    }
  })

  it('leaves the south gate clear of outer buildings', () => {
    const outer = plots.filter((plot) => plot.r > 100)
    for (const plot of outer) {
      expect(Math.abs(angleDelta(plot.angle, Math.PI / 2))).toBeGreaterThan(0.25)
    }
  })

  it('fills a developed town with more scenery than a new one, off the plots and the gate road', () => {
    expect(fillerCount(7)).toBeLessThan(fillerCount(90))
    const hamlet = fillerSpots(7, 'ashford')
    const city = fillerSpots(90, 'ashford')
    expect(city.length).toBeGreaterThan(hamlet.length)
    for (const spot of city) {
      for (const plot of plots) {
        const gap = plot.id === 'headquarters' ? 34 : 26
        expect(Math.hypot(spot.x - plot.x, spot.y - plot.y)).toBeGreaterThanOrEqual(gap)
      }
      const dist = Math.hypot(spot.x - CENTER.x, spot.y - CENTER.y)
      const angle = Math.atan2(spot.y - CENTER.y, spot.x - CENTER.x)
      if (dist > 72 && dist < WALL_R) expect(Math.abs(angleDelta(angle, Math.PI / 2))).toBeGreaterThanOrEqual(0.32)
    }
  })
})
