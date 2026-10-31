import { BUILDINGS } from '@/game/config/buildings.ts'
import type { BuildingId } from '@/game/config/ids.ts'
import { buildingTier, type BuildingTier } from './town-tier.ts'
import {
  CENTER,
  SCENE_H,
  SCENE_W,
  WALL_R,
  angleDelta,
  buildingPlots,
  fillerSpots,
  type FillerSpot,
  type Plot,
} from './town-layout.ts'

const PAL: readonly (readonly [number, number, number, number])[] = [
  [0, 0, 0, 0],
  [154, 196, 86, 255],
  [118, 170, 62, 255],
  [86, 132, 48, 255],
  [222, 196, 148, 255],
  [196, 160, 108, 255],
  [150, 114, 70, 255],
  [206, 198, 184, 255],
  [158, 150, 138, 255],
  [108, 102, 94, 255],
  [156, 172, 182, 255],
  [104, 120, 132, 255],
  [62, 76, 88, 255],
  [232, 200, 152, 255],
  [196, 146, 90, 255],
  [140, 94, 54, 255],
  [92, 58, 36, 255],
  [244, 232, 206, 255],
  [72, 142, 56, 255],
  [232, 186, 64, 255],
  [214, 118, 52, 255],
  [122, 84, 48, 255],
  [246, 242, 230, 255],
  [228, 146, 158, 255],
  [240, 204, 86, 255],
  [64, 92, 42, 150],
  [148, 156, 164, 255],
  [168, 62, 56, 255],
  [246, 214, 140, 255],
  [212, 164, 72, 255],
  [198, 176, 108, 255],
  [220, 216, 206, 255],
  [110, 72, 46, 255],
  [186, 116, 68, 255],
]

const NAME: Record<BuildingId, string> = {
  headquarters: 'Keep',
  timber: 'Timber',
  clay: 'Clay',
  iron: 'Iron',
  farm: 'Farm',
  warehouse: 'Stores',
  barracks: 'Barracks',
  stable: 'Stable',
  workshop: 'Works',
  wall: 'Wall',
  smithy: 'Smithy',
  market: 'Market',
  rally: 'Rally',
  academy: 'Hall',
}

const FONT: Record<string, number[]> = {
  A: [0b010, 0b101, 0b111, 0b101, 0b101],
  B: [0b110, 0b101, 0b110, 0b101, 0b110],
  C: [0b011, 0b100, 0b100, 0b100, 0b011],
  D: [0b110, 0b101, 0b101, 0b101, 0b110],
  E: [0b111, 0b100, 0b110, 0b100, 0b111],
  F: [0b111, 0b100, 0b110, 0b100, 0b100],
  G: [0b011, 0b100, 0b101, 0b101, 0b011],
  H: [0b101, 0b101, 0b111, 0b101, 0b101],
  I: [0b111, 0b010, 0b010, 0b010, 0b111],
  J: [0b001, 0b001, 0b001, 0b101, 0b010],
  K: [0b101, 0b110, 0b100, 0b110, 0b101],
  L: [0b100, 0b100, 0b100, 0b100, 0b111],
  M: [0b101, 0b111, 0b101, 0b101, 0b101],
  N: [0b101, 0b111, 0b111, 0b101, 0b101],
  O: [0b010, 0b101, 0b101, 0b101, 0b010],
  P: [0b110, 0b101, 0b110, 0b100, 0b100],
  Q: [0b010, 0b101, 0b101, 0b011, 0b001],
  R: [0b110, 0b101, 0b110, 0b101, 0b101],
  S: [0b011, 0b100, 0b010, 0b001, 0b110],
  T: [0b111, 0b010, 0b010, 0b010, 0b010],
  U: [0b101, 0b101, 0b101, 0b101, 0b010],
  V: [0b101, 0b101, 0b101, 0b010, 0b010],
  W: [0b101, 0b101, 0b101, 0b111, 0b101],
  X: [0b101, 0b101, 0b010, 0b101, 0b101],
  Y: [0b101, 0b101, 0b010, 0b010, 0b010],
  Z: [0b111, 0b001, 0b010, 0b100, 0b111],
  '0': [0b111, 0b101, 0b101, 0b101, 0b111],
  '1': [0b010, 0b110, 0b010, 0b010, 0b111],
  '2': [0b110, 0b001, 0b010, 0b100, 0b111],
  '3': [0b110, 0b001, 0b110, 0b001, 0b110],
  '4': [0b101, 0b101, 0b111, 0b001, 0b001],
  '5': [0b111, 0b100, 0b110, 0b001, 0b110],
  '6': [0b011, 0b100, 0b110, 0b101, 0b010],
  '7': [0b111, 0b001, 0b010, 0b010, 0b010],
  '8': [0b010, 0b101, 0b010, 0b101, 0b010],
  '9': [0b010, 0b101, 0b011, 0b001, 0b110],
}

export interface TownPaint {
  levels: Record<BuildingId, number>
  queued: ReadonlySet<BuildingId>
  points: number
  seed: string
  active: BuildingId | null
}

class Pix {
  readonly data: Uint8ClampedArray
  constructor() {
    this.data = new Uint8ClampedArray(SCENE_W * SCENE_H * 4)
  }

  plot(x: number, y: number, id: number) {
    const px = x | 0
    const py = y | 0
    if (px < 0 || py < 0 || px >= SCENE_W || py >= SCENE_H) return
    const color = PAL[id]
    const o = (py * SCENE_W + px) * 4
    const a = color[3]
    if (a >= 255) {
      this.data[o] = color[0]
      this.data[o + 1] = color[1]
      this.data[o + 2] = color[2]
      this.data[o + 3] = 255
      return
    }
    if (a <= 0) return
    const t = a / 255
    this.data[o] = color[0] * t + this.data[o] * (1 - t)
    this.data[o + 1] = color[1] * t + this.data[o + 1] * (1 - t)
    this.data[o + 2] = color[2] * t + this.data[o + 2] * (1 - t)
    this.data[o + 3] = 255
  }

  oval(cx: number, cy: number, rx: number, ry: number, id: number) {
    for (let y = -ry; y <= ry; y++) {
      const span = ry === 0 ? 0 : rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))
      for (let x = -span; x <= span; x++) this.plot(cx + x, cy + y, id)
    }
  }
}

export function paintTown(ctx: CanvasRenderingContext2D, paint: TownPaint) {
  const pix = new Pix()
  const plots = buildingPlots()
  ground(pix)
  paths(pix, plots)
  wall(pix, paint.levels.wall)
  const drawables: { y: number; draw: () => void }[] = []
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2 + 0.17
    if (Math.abs(angleDelta(angle, Math.PI / 2)) < 0.28) continue
    const dist = WALL_R + 14 + (i % 3) * 9
    const x = CENTER.x + Math.cos(angle) * dist
    const y = CENTER.y + Math.sin(angle) * dist
    const variant = i % 3
    drawables.push({ y, draw: () => drawTree(pix, x, y, variant) })
  }
  for (const spot of fillerSpots(paint.points, paint.seed)) {
    drawables.push({ y: spot.y, draw: () => drawFiller(pix, spot, paint.points) })
  }
  for (const plot of plots) {
    drawables.push({
      y: plot.y,
      draw: () => drawBuilding(pix, plot, paint.levels[plot.id], paint.queued.has(plot.id), paint.active === plot.id),
    })
  }
  if (paint.queued.has('wall')) drawables.push({ y: CENTER.y + WALL_R, draw: () => drawScaffold(pix, CENTER.x, CENTER.y + WALL_R + 2, 18, 16) })
  drawables.sort((a, b) => a.y - b.y)
  for (const item of drawables) item.draw()
  for (const plot of plots) label(pix, plot.x, plot.y + 8, `${NAME[plot.id]} ${paint.levels[plot.id]}`)
  label(pix, CENTER.x + 34, CENTER.y + WALL_R - 4, `Wall ${paint.levels.wall}`)
  const image = ctx.createImageData(SCENE_W, SCENE_H)
  image.data.set(pix.data)
  ctx.putImageData(image, 0, 0)
}

function ground(pix: Pix) {
  for (let y = 0; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      const n = noise(x, y)
      pix.plot(x, y, 2)
      if (n % 850 === 0) {
        pix.plot(x, y, 3)
        pix.plot(x + 1, y, 1)
      } else if (n % 2600 === 0) {
        pix.plot(x, y, 22)
        pix.plot(x + 1, y, 24)
      } else if (n % 3100 === 0) pix.plot(x, y, 23)
    }
  }
}

function noise(x: number, y: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return (n ^ (n >>> 16)) >>> 0
}

function paths(pix: Pix, plots: Plot[]) {
  const outer = plots.filter((plot) => plot.r > 100)
  for (let y = 0; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) {
      if (!onPath(x, y, outer)) continue
      const n = (x + y) % 5
      pix.plot(x, y, n === 0 ? 6 : n === 1 ? 4 : 5)
    }
  }
  pix.oval(CENTER.x, CENTER.y + 2, 18, 10, 8)
  pix.oval(CENTER.x, CENTER.y + 2, 16, 8, 7)
}

function onPath(x: number, y: number, outer: Plot[]) {
  const dx = x - CENTER.x
  const dy = y - CENTER.y
  const dist = Math.hypot(dx, dy)
  const wobble = ((x * 3 + y * 5) % 5) * 0.25
  if (Math.abs(dist - 44) < 1.7 + wobble) return true
  if (Math.abs(dist - 90) < 2.1 + wobble) return true
  if (Math.abs(dist - 142) < 1.8 + wobble) return true
  const angle = Math.atan2(dy, dx)
  for (const plot of outer) {
    if (Math.abs(angleDelta(angle, plot.angle)) < 0.032 && dist > 28 && dist < 148) return true
  }
  if (Math.abs(angleDelta(angle, Math.PI / 2)) < 0.05 && dist > 24 && dist < WALL_R + 36) return true
  if (Math.abs(x - CENTER.x) < 3.5 && y > CENTER.y + WALL_R - 2) return true
  return false
}

function wall(pix: Pix, level: number) {
  const tier = buildingTier(level, BUILDINGS.wall.maxLevel)
  const thick = level <= 0 ? 0 : tier === 1 ? 3 : tier === 2 ? 5 : 7
  const gate = 0.2
  for (let y = CENTER.y - WALL_R - 16; y <= CENTER.y + WALL_R + 16; y++) {
    for (let x = CENTER.x - WALL_R - 16; x <= CENTER.x + WALL_R + 16; x++) {
      const dx = x - CENTER.x
      const dy = y - CENTER.y
      const dist = Math.hypot(dx, dy)
      const angle = Math.atan2(dy, dx)
      const south = Math.abs(angleDelta(angle, Math.PI / 2)) < gate
      if (level <= 0 || south) continue
      if (dist < WALL_R || dist >= WALL_R + thick) continue
      const wood = tier <= 1
      const edge = dist < WALL_R + 1
      const shade = dist > WALL_R + thick - 2
      pix.plot(x, y, wood ? (edge ? 13 : shade ? 16 : 15) : edge ? 7 : shade ? 9 : 8)
      if (tier === 3 && Math.round(angle * 28) % 2 === 0 && dist >= WALL_R + thick - 1) pix.plot(x, y - 1, 7)
    }
  }
  const towers = [-Math.PI / 2, 0, Math.PI, ...(tier === 3 ? [-Math.PI / 4, (3 * Math.PI) / 4] : [])]
  if (tier >= 2) {
    for (const angle of towers) {
      drawTower(pix, CENTER.x + Math.cos(angle) * (WALL_R + 1), CENTER.y + Math.sin(angle) * (WALL_R + 1), tier === 3)
    }
  }
  const gy = CENTER.y + WALL_R
  if (level <= 0) drawStakes(pix)
  else drawGate(pix, CENTER.x, gy, tier)
}

function drawStakes(pix: Pix) {
  const count = 42
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    if (Math.abs(angleDelta(angle, Math.PI / 2)) < 0.22) continue
    const x = CENTER.x + Math.cos(angle) * WALL_R
    const y = CENTER.y + Math.sin(angle) * WALL_R
    for (let h = 0; h < 5; h++) {
      pix.plot(x, y - h, h > 3 ? 13 : 15)
      pix.plot(x + 1, y - h, 16)
    }
  }
}

function drawTower(pix: Pix, x: number, y: number, grand: boolean) {
  const w = grand ? 8 : 6
  const h = grand ? 12 : 8
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const shade = col === 0 ? 7 : col === w - 1 ? 9 : 8
      pix.plot(x - w / 2 + col, y - h + row, shade)
    }
  }
  for (let col = -1; col <= w; col++) pix.plot(x - w / 2 + col, y - h - 1, 12)
  for (let col = 1; col < w - 1; col++) pix.plot(x - w / 2 + col, y - h - 2, 11)
  if (grand) {
    pix.plot(x, y - h - 5, 16)
    pix.plot(x, y - h - 4, 16)
    pix.plot(x + 1, y - h - 5, 27)
    pix.plot(x + 2, y - h - 4, 27)
    pix.plot(x + 1, y - h - 3, 27)
  }
}

function drawGate(pix: Pix, x: number, y: number, tier: BuildingTier) {
  if (tier === 0) return
  for (let row = 0; row < 8; row++) {
    pix.plot(x - 8, y - row, tier === 1 ? 15 : 8)
    pix.plot(x + 8, y - row, tier === 1 ? 15 : 8)
  }
  if (tier >= 2) {
    for (let col = -7; col <= 7; col++) pix.plot(x + col, y - 8, 9)
    for (let col = -5; col <= 5; col++) pix.plot(x + col, y - 9, 11)
    if (tier === 3) {
      pix.plot(x - 2, y - 12, 16)
      pix.plot(x - 2, y - 11, 16)
      pix.plot(x - 1, y - 12, 27)
      pix.plot(x, y - 11, 27)
    }
  }
}

function drawBuilding(pix: Pix, plot: Plot, level: number, queued: boolean, active: boolean) {
  const tier = buildingTier(level, BUILDINGS[plot.id].maxLevel)
  if (tier === 0) {
    drawEmpty(pix, plot.x, plot.y)
    if (queued) drawScaffold(pix, plot.x, plot.y, 16, 12)
    if (active) drawSelect(pix, plot.x, plot.y, 16, 12)
    return
  }
  const box = drawStructure(pix, plot.id, plot.x, plot.y, tier)
  if (queued) drawScaffold(pix, plot.x, plot.y, box.w, box.h)
  if (active) drawSelect(pix, plot.x, plot.y, box.w, box.h)
}

function drawEmpty(pix: Pix, x: number, y: number) {
  pix.oval(x, y - 1, 8, 4, 6)
  pix.oval(x, y - 2, 6, 3, 5)
  for (const [dx, dy] of [
    [-7, -5],
    [6, -5],
    [-7, 1],
    [6, 1],
  ] as const) {
    pix.plot(x + dx, y + dy, 8)
    pix.plot(x + dx + 1, y + dy, 7)
  }
}

function drawStructure(pix: Pix, id: BuildingId, x: number, y: number, tier: 1 | 2 | 3): { w: number; h: number } {
  if (id === 'rally') return drawRally(pix, x, y, tier)
  if (id === 'iron') return drawIron(pix, x, y, tier)
  if (id === 'farm') return drawFarm(pix, x, y, tier)
  if (id === 'clay') drawPit(pix, x - 12, y - 1, tier)
  if (id === 'timber') drawLogs(pix, x - 14, y - 2, tier)
  const spec = houseSpec(id, tier)
  drawHouse(pix, x, y, spec)
  if (id === 'timber' && tier === 3) drawLogs(pix, x + 14, y - 1, tier)
  if (id === 'barracks') drawSpears(pix, x + spec.w / 2 + 2, y)
  if (id === 'smithy') drawAnvil(pix, x - spec.w / 2 - 2, y)
  if (id === 'stable') drawFence(pix, x - 8, y + 2, 16)
  if (id === 'workshop') drawCart(pix, x + spec.w / 2, y)
  if (id === 'warehouse') drawBarrels(pix, x + spec.w / 2 - 2, y - 1)
  return { w: spec.w + 8, h: spec.roofH + spec.wallH + (spec.tower ? 10 : 4) }
}

interface HouseSpec {
  w: number
  roofH: number
  wallH: number
  roof: 'plank' | 'slate'
  wall: 'wood' | 'half' | 'mixed'
  chimney: boolean
  windows: 1 | 2
  banner: boolean
  awning: boolean
  tower: boolean
}

function houseSpec(id: BuildingId, tier: 1 | 2 | 3): HouseSpec {
  const spec: HouseSpec = {
    w: tier === 1 ? 16 : tier === 2 ? 24 : 32,
    roofH: tier === 1 ? 8 : tier === 2 ? 12 : 15,
    wallH: tier === 1 ? 7 : tier === 2 ? 10 : 13,
    roof: tier === 1 ? 'plank' : 'slate',
    wall: tier === 1 ? 'wood' : tier === 2 ? 'half' : 'mixed',
    chimney: tier >= 2 || id === 'smithy',
    windows: tier === 1 ? 1 : 2,
    banner: false,
    awning: false,
    tower: false,
  }
  if (id === 'headquarters') {
    spec.w += 6
    spec.roofH += 2
    spec.banner = true
    spec.chimney = true
    spec.tower = tier >= 2
  }
  if (id === 'market') spec.awning = true
  if (id === 'academy' || id === 'barracks') spec.banner = tier >= 2
  if (id === 'smithy') spec.chimney = true
  return spec
}

function drawHouse(pix: Pix, fx: number, fy: number, spec: HouseSpec) {
  const left = Math.round(fx - spec.w / 2)
  const wallTop = Math.round(fy - spec.wallH - 2)
  const roofTop = wallTop - spec.roofH
  pix.oval(fx, fy + 1, spec.w * 0.42, 3.2, 25)
  for (let row = 0; row < spec.roofH; row++) {
    const y = roofTop + row
    const inset = Math.floor(((spec.roofH - row) / spec.roofH) * (spec.w * 0.42))
    const x0 = left + inset
    const x1 = left + spec.w - 1 - inset
    for (let x = x0; x <= x1; x++) {
      const edge = row === spec.roofH - 1 ? 'eave' : x === x0 ? 'l' : x === x1 ? 'r' : 'm'
      pix.plot(x, y, roofPixel(spec.roof, x, row, edge))
    }
  }
  const inset = Math.max(2, Math.floor(spec.w * 0.14))
  const x0 = left + inset
  const x1 = left + spec.w - inset
  for (let row = 0; row < spec.wallH; row++) {
    for (let x = x0; x < x1; x++) pix.plot(x, wallTop + row, wallPixel(spec.wall, x - x0, row, spec.wallH))
  }
  for (let x = x0 - 1; x < x1 + 1; x++) pix.plot(x, fy - 2, 9)
  for (let x = x0; x < x1; x++) pix.plot(x, fy - 1, 8)
  const doorW = 3
  const doorH = Math.min(5, spec.wallH - 2)
  for (let row = 0; row < doorH; row++) {
    for (let col = 0; col < doorW; col++) pix.plot(fx - 1 + col, fy - 2 - doorH + row, 16)
  }
  pix.plot(fx + 1, fy - 4, 29)
  const wins = spec.windows === 2 && spec.w >= 22 ? [x0 + 2, x1 - 5] : [Math.round(fx + 4)]
  for (const wx of wins) {
    if (Math.abs(wx - fx) < 3) continue
    frame(pix, wx, wallTop + 2)
  }
  if (spec.chimney) {
    const cx = left + 4
    for (let row = 0; row < 6; row++) {
      pix.plot(cx, roofTop + 2 - row, 9)
      pix.plot(cx + 1, roofTop + 2 - row, 8)
    }
    pix.plot(cx + 3, roofTop - 5, 31)
    pix.plot(cx + 4, roofTop - 6, 31)
  }
  if (spec.tower) drawSideTower(pix, left - 1, wallTop + 4)
  if (spec.banner) drawFlag(pix, fx + 1, roofTop - 1)
  if (spec.awning) {
    for (let i = 0; i < spec.w - 8; i++) {
      pix.plot(x0 + i, wallTop + 1, i % 4 < 2 ? 27 : 22)
      pix.plot(x0 + i, wallTop + 2, 16)
    }
  }
}

function roofPixel(kind: 'plank' | 'slate', x: number, row: number, edge: 'l' | 'r' | 'm' | 'eave') {
  if (kind === 'plank') {
    if (edge === 'eave' || edge === 'r') return 15
    if (edge === 'l' || x % 5 === 0) return 13
    return row % 2 === 0 ? 14 : 13
  }
  if (edge === 'eave' || edge === 'r') return 12
  if (edge === 'l' || x % 6 === 0) return 10
  return row % 2 === 0 ? 11 : 12
}

function wallPixel(kind: HouseSpec['wall'], x: number, row: number, wallH: number) {
  if (kind === 'mixed' && row > wallH * 0.42) return wallPixel('half', x, row, wallH)
  if (kind === 'mixed') return (row % 4 === 0 || x % 5 === 0) ? 9 : (x + row) % 3 === 0 ? 7 : 8
  if (kind === 'wood') return row % 3 === 0 ? 15 : x % 2 === 0 ? 13 : 14
  if (row % 5 === 0 || x % 7 === 0) return 16
  return 17
}

function frame(pix: Pix, x: number, y: number) {
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) pix.plot(x + col, y + row, 16)
  }
  pix.plot(x + 1, y + 1, 28)
}

function drawSideTower(pix: Pix, x: number, foot: number) {
  for (let row = 0; row < 16; row++) {
    pix.plot(x, foot - row, 9)
    pix.plot(x + 1, foot - row, 8)
    pix.plot(x + 2, foot - row, 7)
  }
  for (let col = -1; col <= 3; col++) pix.plot(x + col, foot - 17, 12)
  pix.plot(x + 1, foot - 18, 11)
  drawFlag(pix, x + 1, foot - 19)
}

function drawFlag(pix: Pix, x: number, y: number) {
  pix.plot(x, y, 16)
  pix.plot(x, y - 1, 16)
  pix.plot(x, y - 2, 16)
  pix.plot(x + 1, y - 2, 27)
  pix.plot(x + 2, y - 1, 27)
  pix.plot(x + 1, y - 1, 27)
}

function drawSelect(pix: Pix, x: number, y: number, w: number, h: number) {
  const left = Math.round(x - w / 2 - 2)
  const right = Math.round(x + w / 2 + 2)
  const top = Math.round(y - h - 2)
  for (let i = 0; i < 4; i++) {
    pix.plot(left + i, top, 29)
    pix.plot(left, top + i, 29)
    pix.plot(right - i, top, 29)
    pix.plot(right, top + i, 29)
    pix.plot(left + i, y + 1, 29)
    pix.plot(right - i, y + 1, 29)
  }
}

function drawScaffold(pix: Pix, x: number, y: number, w: number, h: number) {
  const left = Math.round(x - w / 2)
  const right = Math.round(x + w / 2)
  const top = Math.round(y - h)
  for (let row = top; row <= y; row++) {
    pix.plot(left, row, 16)
    pix.plot(right, row, 16)
  }
  for (const row of [top + 2, top + Math.floor(h / 2), y - 3]) {
    for (let col = left; col <= right; col++) pix.plot(col, row, 14)
  }
  pix.plot(left + 2, top + 4, 15)
  pix.plot(right - 2, top + 4, 15)
}

function drawRally(pix: Pix, x: number, y: number, tier: 1 | 2 | 3) {
  pix.oval(x, y, tier === 1 ? 8 : 11, 5, 8)
  pix.oval(x, y - 1, tier === 1 ? 6 : 8, 3, 7)
  drawFlag(pix, x, y - 4)
  if (tier >= 2) drawFlag(pix, x + 6, y - 2)
  return { w: 16, h: 14 }
}

function drawIron(pix: Pix, x: number, y: number, tier: 1 | 2 | 3) {
  pix.oval(x, y - 2, 10 + tier, 6, 9)
  pix.oval(x - 2, y - 5, 7, 4, 8)
  pix.oval(x + 1, y - 4, 3, 3, 16)
  pix.plot(x, y - 5, 16)
  pix.plot(x + 1, y - 6, 9)
  for (let col = -3; col <= 3; col++) pix.plot(x + col, y - 7, 15)
  if (tier >= 2) drawHouse(pix, x + 8, y, { ...houseSpec('warehouse', tier === 3 ? 2 : 1), w: 12, roofH: 6, wallH: 5, chimney: false, windows: 1, tower: false })
  drawCart(pix, x - 10, y)
  return { w: 24, h: 16 }
}

function drawFarm(pix: Pix, x: number, y: number, tier: 1 | 2 | 3) {
  const plots = tier === 1 ? 1 : tier === 2 ? 2 : 3
  for (let i = 0; i < plots; i++) drawGarden(pix, x - 14 + i * 8, y - 2)
  drawHouse(pix, x + 6, y, houseSpec('farm', tier))
  return { w: 28, h: tier === 1 ? 16 : 26 }
}

function drawPit(pix: Pix, x: number, y: number, tier: 1 | 2 | 3) {
  pix.oval(x, y, 6 + tier, 3, 32)
  pix.oval(x, y - 1, 3, 2, 33)
  pix.plot(x + 5, y - 2, 14)
  pix.plot(x + 6, y - 2, 14)
}

function drawLogs(pix: Pix, x: number, y: number, tier: 1 | 2 | 3) {
  const rows = tier === 3 ? 4 : 3
  for (let i = 0; i < rows; i++) {
    for (let col = 0; col < 7; col++) pix.plot(x + col, y - i * 2, i % 2 ? 14 : 15)
    pix.plot(x, y - i * 2, 16)
    pix.plot(x + 6, y - i * 2, 16)
  }
}

function drawSpears(pix: Pix, x: number, y: number) {
  for (const dx of [0, 3]) {
    for (let row = 0; row < 8; row++) pix.plot(x + dx, y - row, 14)
    pix.plot(x + dx, y - 9, 26)
    pix.plot(x + dx - 1, y - 8, 26)
  }
}

function drawAnvil(pix: Pix, x: number, y: number) {
  for (let col = 0; col < 5; col++) pix.plot(x + col, y - 2, 8)
  for (let col = 1; col < 4; col++) pix.plot(x + col, y - 3, 26)
  pix.plot(x + 2, y - 1, 9)
}

function drawFence(pix: Pix, x: number, y: number, length: number) {
  for (let i = 0; i < length; i++) {
    if (i % 3 === 0) {
      pix.plot(x + i, y, 15)
      pix.plot(x + i, y - 1, 15)
      pix.plot(x + i, y - 2, 14)
    }
    pix.plot(x + i, y - 1, 14)
  }
}

function drawCart(pix: Pix, x: number, y: number) {
  for (let col = 0; col < 7; col++) pix.plot(x + col, y - 3, 15)
  for (let col = 1; col < 6; col++) pix.plot(x + col, y - 4, 14)
  pix.plot(x + 1, y - 1, 16)
  pix.plot(x + 1, y - 2, 16)
  pix.plot(x + 5, y - 1, 16)
  pix.plot(x + 5, y - 2, 16)
}

function drawBarrels(pix: Pix, x: number, y: number) {
  drawBarrel(pix, x, y)
  drawBarrel(pix, x + 4, y)
  if ((x + y) % 2 === 0) drawBarrel(pix, x + 2, y - 4)
}

function drawBarrel(pix: Pix, x: number, y: number) {
  for (let row = 0; row < 4; row++) {
    pix.plot(x, y - row, 15)
    pix.plot(x + 1, y - row, row === 1 ? 26 : 14)
    pix.plot(x + 2, y - row, 15)
  }
}

function drawGarden(pix: Pix, x: number, y: number) {
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) pix.plot(x + col, y - row, 6)
  }
  for (let col = 1; col < 5; col++) {
    pix.plot(x + col, y - 1, 18)
    pix.plot(x + col, y - 3, 18)
  }
  drawFence(pix, x - 1, y, 8)
}

function drawFiller(pix: Pix, spot: FillerSpot, points: number) {
  if (spot.kind === 'tree') drawTree(pix, spot.x, spot.y, spot.variant)
  else if (spot.kind === 'cottage') {
    const tier = points > 55 && spot.variant === 0 ? 2 : 1
    drawHouse(pix, spot.x, spot.y, { ...houseSpec('warehouse', tier), w: tier === 1 ? 12 : 16, roofH: tier === 1 ? 6 : 8, wallH: tier === 1 ? 5 : 7, banner: false, tower: false, awning: false })
  } else if (spot.kind === 'garden') drawGarden(pix, spot.x - 3, spot.y)
  else if (spot.kind === 'barrels') drawBarrels(pix, spot.x, spot.y)
  else if (spot.kind === 'cart') drawCart(pix, spot.x, spot.y)
  else drawFence(pix, spot.x - 6, spot.y, 12)
}

function drawTree(pix: Pix, x: number, y: number, variant: number) {
  const trunk = variant === 1 ? 22 : 21
  for (let row = 0; row < 6; row++) {
    pix.plot(x, y - row, trunk)
    if (variant === 1 && row % 2 === 0) pix.plot(x + 1, y - row, 16)
  }
  const leaf = variant === 0 ? 18 : variant === 1 ? 19 : 20
  const accent = variant === 0 ? 19 : 20
  pix.oval(x, y - 11, 7, 5, leaf)
  pix.oval(x - 3, y - 8, 4, 3, accent)
  pix.oval(x + 3, y - 9, 3, 3, leaf)
  pix.plot(x - 2, y - 13, 22)
  pix.plot(x + 2, y - 12, variant === 2 ? 19 : 24)
}

function label(pix: Pix, x: number, y: number, text: string) {
  drawText(pix, text.toUpperCase(), x, y, 17, 16)
}

function drawText(pix: Pix, text: string, x: number, y: number, fill: number, outline: number) {
  const width = text.length * 4 - 1
  const origin = Math.round(x - width / 2)
  for (let py = y - 1; py <= y + 5; py++) {
    for (let px = origin - 1; px <= origin + width; px++) pix.plot(px, py, outline)
  }
  let cursor = origin
  for (const char of text) {
    const glyph = FONT[char]
    if (!glyph) {
      cursor += 4
      continue
    }
    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < 3; col++) {
        if (((glyph[row] >> (2 - col)) & 1) === 0) continue
        pix.plot(cursor + col, y + row, fill)
      }
    }
    cursor += 4
  }
}
