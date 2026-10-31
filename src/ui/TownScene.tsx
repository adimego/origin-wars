import { useState, type KeyboardEvent } from 'react'
import { BUILDINGS } from '@/game/config/buildings.ts'
import type { BuildingId } from '@/game/config/ids.ts'
import { Dialog, DialogContent } from '@/components/ui/dialog.tsx'
import { BuildingDetail } from './building-detail.tsx'
import { useGame } from './game-context.tsx'
import { buildingTier, type BuildingTier } from './town-tier.ts'

const PLOTS: { id: BuildingId; x: number; y: number }[] = [
  { id: 'timber', x: 200, y: 168 },
  { id: 'clay', x: 400, y: 162 },
  { id: 'iron', x: 600, y: 168 },
  { id: 'farm', x: 800, y: 172 },
  { id: 'warehouse', x: 200, y: 318 },
  { id: 'headquarters', x: 430, y: 308 },
  { id: 'academy', x: 650, y: 318 },
  { id: 'barracks', x: 820, y: 318 },
  { id: 'smithy', x: 190, y: 458 },
  { id: 'market', x: 370, y: 464 },
  { id: 'rally', x: 540, y: 468 },
  { id: 'stable', x: 700, y: 460 },
  { id: 'workshop', x: 840, y: 456 },
]

const SHORT: Record<BuildingId, string> = {
  headquarters: 'Headquarters',
  timber: 'Timber',
  clay: 'Clay',
  iron: 'Iron',
  farm: 'Farm',
  warehouse: 'Warehouse',
  barracks: 'Barracks',
  stable: 'Stable',
  workshop: 'Workshop',
  wall: 'Wall',
  smithy: 'Smithy',
  market: 'Market',
  rally: 'Rally',
  academy: 'Command',
}

const WALL = { x: 64, y: 46, w: 872, h: 490 }

export function TownScene() {
  const { state, build } = useGame()
  const [openId, setOpenId] = useState<BuildingId | null>(null)
  const [note, setNote] = useState<string | null>(null)
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId && entry.ownerId === state.playerId)
  if (!town) return null
  const queued = new Set(town.buildQueue.map((job) => job.buildingId))

  const open = (id: BuildingId) => {
    setNote(null)
    setOpenId(id)
  }

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-[#16130f]" data-town-view>
      <svg
        viewBox="0 0 1000 580"
        className="block h-auto w-full"
        role="img"
        aria-label={`${town.name}, illustrated town`}
      >
        <Ground />
        <TownWall level={town.buildings.wall} active={openId === 'wall'} scaffolding={queued.has('wall')} onSelect={() => open('wall')} />
        {PLOTS.map((plot) => (
          <Plot
            key={plot.id}
            id={plot.id}
            x={plot.x}
            y={plot.y}
            level={town.buildings[plot.id]}
            active={openId === plot.id}
            scaffolding={queued.has(plot.id)}
            onSelect={() => open(plot.id)}
          />
        ))}
      </svg>
      <p className="border-t border-line px-4 py-2 text-xs text-faint">
        Click a building to open it. Empty plots are unbuilt. Wood, then stone, then a grand hall.
      </p>
      <Dialog
        open={openId != null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null)
        }}
      >
        <DialogContent>
          {openId ? (
            <BuildingDetail
              id={openId}
              titleAs="dialog"
              onBuild={(id) => setNote(build(id))}
            />
          ) : null}
          {note ? <p className="mt-3 text-sm text-blood">{note}</p> : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function Ground() {
  return (
    <g pointerEvents="none">
      <rect width="1000" height="580" fill="#243028" />
      <ellipse cx="180" cy="70" rx="120" ry="36" fill="#314236" opacity="0.7" />
      <ellipse cx="820" cy="90" rx="150" ry="40" fill="#314236" opacity="0.55" />
      <ellipse cx="140" cy="520" rx="90" ry="28" fill="#314236" opacity="0.5" />
      <ellipse cx="860" cy="530" rx="110" ry="30" fill="#314236" opacity="0.45" />
      <rect x="78" y="70" width="844" height="448" rx="18" fill="#3c342b" />
      <path d="M120 300 H880" stroke="#5a4638" strokeWidth="16" fill="none" opacity="0.55" />
      <path d="M430 78 V500" stroke="#5a4638" strokeWidth="14" fill="none" opacity="0.4" />
      <Tree x={70} y={48} />
      <Tree x={930} y={56} scale={0.8} />
      <Tree x={64} y={540} scale={0.7} />
      <Tree x={948} y={520} scale={0.9} />
    </g>
  )
}

function Tree({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-3" y="0" width="6" height="16" fill="#5c3a22" />
      <circle cy="-6" r="14" fill="#3e5a3a" />
      <circle cx="10" cy="-2" r="10" fill="#4d6b44" />
      <circle cx="-9" cy="-1" r="9" fill="#2f4630" />
    </g>
  )
}

function TownWall({
  level,
  active,
  scaffolding,
  onSelect,
}: {
  level: number
  active: boolean
  scaffolding: boolean
  onSelect: () => void
}) {
  const max = BUILDINGS.wall.maxLevel
  const tier = buildingTier(level, max)
  const { x, y, w, h } = WALL
  const thick = level <= 0 ? 8 : 10 + level * 0.85
  const innerX = x + thick
  const innerY = y + thick
  const innerW = w - thick * 2
  const innerH = h - thick * 2
  const wooden = tier <= 1
  const fill = level <= 0 ? '#6b5344' : wooden ? '#7a4e2d' : tier === 2 ? '#9a9186' : '#f0e6d4'
  const tower = tier <= 0 ? 0 : tier === 1 ? 10 + level * 0.4 : tier === 2 ? 16 + (level - 6) * 1.1 : 24 + (level - 13) * 1.1
  const corners = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ] as const
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Wall, level ${level}`}
      className="town-plot"
      data-active={active ? 'true' : 'false'}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <path
        className="wall-band"
        fill={fill}
        fillRule="evenodd"
        stroke={active ? '#e2b45a' : wooden ? '#3d2918' : '#4a4038'}
        strokeWidth={active ? 3 : 1.5}
        strokeDasharray={level <= 0 ? '5 4' : undefined}
        d={`M ${x} ${y} h ${w} v ${h} h ${-w} z M ${innerX} ${innerY} h ${innerW} v ${innerH} h ${-innerW} z`}
      />
      {tier >= 2
        ? corners.map(([cx, cy]) => <Tower key={`${cx}-${cy}`} cx={cx} cy={cy} size={tower} tier={tier === 3 ? 3 : 2} />)
        : tier === 1
          ? corners.map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={tower / 2} fill="#5c3a22" stroke="#d2ae62" strokeWidth="2" />)
          : null}
      {tier === 3 ? (
        <g pointerEvents="none">
          {Array.from({ length: 18 }, (_, index) => (
            <rect key={`t${index}`} x={x + 28 + index * 48} y={y - 6} width="22" height="8" fill="#f7f1e6" />
          ))}
          {Array.from({ length: 8 }, (_, index) => (
            <rect key={`l${index}`} x={x - 6} y={y + 36 + index * 58} width="8" height="22" fill="#f7f1e6" />
          ))}
        </g>
      ) : null}
      {scaffolding ? <WallScaffold x={x + w / 2} y={y} /> : null}
      <text x="500" y="28" textAnchor="middle" className="town-label">
        Wall · Lv {level}
      </text>
    </g>
  )
}

function Tower({ cx, cy, size, tier }: { cx: number; cy: number; size: number; tier: 2 | 3 }) {
  const s = Math.max(16, size)
  return (
    <g pointerEvents="none">
      <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx="2" fill={tier === 3 ? '#f3eadb' : '#c4bbb0'} stroke="#4a4038" />
      <rect x={cx - s / 2} y={cy - s / 2} width={s * 0.28} height={s} fill={tier === 3 ? '#d9cdb8' : '#8e867c'} />
      {tier === 3 ? (
        <>
          <rect x={cx - 2} y={cy - s / 2 - 14} width="4" height="16" fill="#7c2f2c" />
          <polygon points={`${cx},${cy - s / 2 - 24} ${cx + 9},${cy - s / 2 - 12} ${cx},${cy - s / 2 - 12}`} fill="#9d2b2b" />
        </>
      ) : null}
    </g>
  )
}

function WallScaffold({ x, y }: { x: number; y: number }) {
  return (
    <g className="town-scaffold" pointerEvents="none" transform={`translate(${x} ${y - 8})`}>
      <line x1="-28" y1="-36" x2="-28" y2="10" stroke="#d2ae62" strokeWidth="2" />
      <line x1="28" y1="-36" x2="28" y2="10" stroke="#d2ae62" strokeWidth="2" />
      <line x1="-28" y1="-18" x2="28" y2="-18" stroke="#d2ae62" strokeWidth="2" />
      <line x1="-22" y1="-36" x2="-10" y2="-18" stroke="#8a5a32" strokeWidth="1.5" />
      <line x1="22" y1="-36" x2="10" y2="-18" stroke="#8a5a32" strokeWidth="1.5" />
    </g>
  )
}

function Plot({
  id,
  x,
  y,
  level,
  active,
  scaffolding,
  onSelect,
}: {
  id: BuildingId
  x: number
  y: number
  level: number
  active: boolean
  scaffolding: boolean
  onSelect: () => void
}) {
  const max = BUILDINGS[id].maxLevel
  const tier = buildingTier(level, max)
  const bulk = tier === 0 ? 1 : 0.78 + (level / max) * 0.3
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect()
    }
  }

  return (
    <g
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label={`${BUILDINGS[id].name}, level ${level}`}
      className="town-plot"
      data-active={active ? 'true' : 'false'}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      <rect className="plot-frame" x="-72" y="-78" width="144" height="132" rx="12" />
      <g transform={`scale(${bulk})`}>
        <Glyph id={id} tier={tier} />
      </g>
      {scaffolding ? <Scaffold /> : null}
      <text y="46" textAnchor="middle" className="town-label">
        {SHORT[id]}
      </text>
      <text y="60" textAnchor="middle" className="town-level">
        Lv {level}
      </text>
    </g>
  )
}

function Scaffold() {
  return (
    <g className="town-scaffold" pointerEvents="none">
      <line x1="-42" y1="-72" x2="-42" y2="10" stroke="#d2ae62" strokeWidth="2" />
      <line x1="42" y1="-72" x2="42" y2="10" stroke="#d2ae62" strokeWidth="2" />
      <line x1="-42" y1="-50" x2="42" y2="-50" stroke="#d2ae62" strokeWidth="2" />
      <line x1="-42" y1="-24" x2="42" y2="-24" stroke="#d2ae62" strokeWidth="2" />
      <line x1="-36" y1="-72" x2="-22" y2="-50" stroke="#8a5a32" strokeWidth="1.5" />
      <line x1="36" y1="-72" x2="22" y2="-50" stroke="#8a5a32" strokeWidth="1.5" />
      <line x1="-36" y1="-50" x2="-22" y2="-24" stroke="#8a5a32" strokeWidth="1.5" />
      <line x1="36" y1="-50" x2="22" y2="-24" stroke="#8a5a32" strokeWidth="1.5" />
    </g>
  )
}

function Glyph({ id, tier }: { id: BuildingId; tier: BuildingTier }) {
  if (tier === 0) return <Foundation id={id} />
  if (id === 'timber') return <Timber tier={tier} />
  if (id === 'clay') return <Clay tier={tier} />
  if (id === 'iron') return <Iron tier={tier} />
  if (id === 'farm') return <Farm tier={tier} />
  if (id === 'warehouse') return <Warehouse tier={tier} />
  if (id === 'barracks') return <Barracks tier={tier} />
  if (id === 'stable') return <Stable tier={tier} />
  if (id === 'workshop') return <Workshop tier={tier} />
  if (id === 'smithy') return <Smithy tier={tier} />
  if (id === 'market') return <Market tier={tier} />
  if (id === 'rally') return <Rally tier={tier} />
  if (id === 'academy') return <Academy tier={tier} />
  return <Headquarters tier={tier} />
}

function Foundation({ id }: { id: BuildingId }) {
  return (
    <g>
      <ellipse cx="0" cy="8" rx="40" ry="12" fill="#2a241e" />
      <rect x="-32" y="-22" width="64" height="32" fill="none" stroke="#6d5e4e" strokeDasharray="4 3" />
      <rect x="-34" y="-24" width="7" height="7" fill="#8d7d68" />
      <rect x="27" y="-24" width="7" height="7" fill="#8d7d68" />
      <rect x="-34" y="4" width="7" height="7" fill="#8d7d68" />
      <rect x="27" y="4" width="7" height="7" fill="#8d7d68" />
      <g opacity="0.55">{mark(id)}</g>
    </g>
  )
}

function mark(id: BuildingId) {
  if (id === 'timber') return <Logs x={-8} y={-4} />
  if (id === 'clay') return <ellipse cx="0" cy="2" rx="14" ry="6" fill="#a8643c" />
  if (id === 'iron') return <polygon points="0,-16 14,6 -14,6" fill="#5c656c" />
  if (id === 'farm') return <rect x="-16" y="-2" width="32" height="8" fill="#6d8a48" />
  if (id === 'warehouse') return <rect x="-10" y="-8" width="20" height="14" fill="#8a7b68" />
  if (id === 'barracks') return <Spears />
  if (id === 'stable') return <path d="M-8 6 Q0 -10 8 6" fill="none" stroke="#c4bbb0" strokeWidth="2" />
  if (id === 'workshop') return <circle r="6" cy="-2" fill="none" stroke="#c4bbb0" strokeWidth="2" />
  if (id === 'smithy') return <Anvil />
  if (id === 'market') return <polygon points="-14,2 0,-12 14,2" fill="#9d2b2b" />
  if (id === 'rally') return <Flag />
  if (id === 'academy') return <rect x="-2" y="-18" width="4" height="22" fill="#7c2f2c" />
  return <polygon points="0,-16 12,4 -12,4" fill="none" stroke="#c4bbb0" strokeWidth="2" />
}

function House({
  tier,
  wide = 1,
  tall = 1,
  flag = false,
}: {
  tier: 1 | 2 | 3
  wide?: number
  tall?: number
  flag?: boolean
}) {
  const wooden = tier === 1
  const grand = tier === 3
  const wall = wooden ? '#c4894a' : grand ? '#f4ecdf' : '#c9c0b4'
  const shade = wooden ? '#7a4e2c' : grand ? '#d9cdb8' : '#8e867c'
  const roof = wooden ? '#d2ae62' : grand ? '#7c2f2c' : '#3e4c5c'
  const w = 56 * wide * (wooden ? 0.82 : grand ? 1.16 : 1)
  const h = 30 * tall * (wooden ? 0.78 : grand ? 1.22 : 1)
  const roofH = (wooden ? 14 : grand ? 22 : 18) * tall
  const x = -w / 2
  const y = 6 - h
  const peakY = y - roofH
  const window = wooden ? '#f3d7a1' : '#f8e7c0'
  return (
    <g>
      <ellipse cx="0" cy="10" rx={w * 0.7} ry="8" fill="#000" opacity="0.22" />
      {grand ? (
        <>
          <rect x={x - 12} y={y + 4} width="14" height={h - 4} fill={wall} />
          <polygon points={`${x - 16},${y + 4} ${x - 5},${y - roofH + 6} ${x + 6},${y + 4}`} fill={roof} />
          <rect x={x + w - 2} y={y + 4} width="14" height={h - 4} fill={wall} />
          <polygon points={`${x + w - 6},${y + 4} ${x + w + 5},${y - roofH + 6} ${x + w + 16},${y + 4}`} fill={roof} />
        </>
      ) : null}
      <polygon points={`${x - 7},${y} ${0},${y - roofH} ${x + w + 7},${y}`} fill={roof} />
      {grand ? <polygon points={`${x - 7},${y} ${0},${y - roofH} ${x + w + 7},${y}`} fill="none" stroke="#e2b45a" strokeWidth="1.6" /> : null}
      <rect x={x} y={y} width={w} height={h} fill={wall} />
      <rect x={x} y={y} width={Math.max(6, w * 0.16)} height={h} fill={shade} />
      <rect x="-6" y={y + h - (grand ? 18 : 14)} width="12" height={grand ? 18 : 14} rx="1" fill="#3a2418" />
      <rect x={x + 8} y={y + 6} width="7" height="7" fill={window} />
      {tier >= 2 ? <rect x={x + w - 16} y={y + 6} width="7" height="7" fill={window} /> : null}
      {grand ? <rect x={x + w / 2 - 4} y={y + 6} width="7" height="7" fill={window} /> : null}
      {flag ? (
        <g>
          <rect x="-1.5" y={peakY - 14} width="3" height="16" fill="#5c4030" />
          <polygon points={`1.5,${peakY - 14} 14,${peakY - 8} 1.5,${peakY - 3}`} fill="#9d2b2b" />
        </g>
      ) : null}
    </g>
  )
}

function Logs({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="22" height="6" rx="3" fill="#6b4428" />
      <rect x="2" y="-6" width="22" height="6" rx="3" fill="#8a5a32" />
      <rect x="4" y="-12" width="22" height="6" rx="3" fill="#c48a52" />
    </g>
  )
}

function Spears() {
  return (
    <g stroke="#c4bbb0" strokeWidth="1.5">
      <line x1="-8" y1="4" x2="-8" y2="-14" />
      <line x1="0" y1="4" x2="0" y2="-18" />
      <polygon points="-8,-14 -11,-8 -5,-8" fill="#c4bbb0" />
      <polygon points="0,-18 -3,-12 3,-12" fill="#c4bbb0" />
    </g>
  )
}

function Anvil() {
  return (
    <g>
      <rect x="-8" y="2" width="16" height="4" fill="#8e867c" />
      <polygon points="-12,-2 10,-2 6,2 -8,2" fill="#c4bbb0" />
    </g>
  )
}

function Flag({ tall = false }: { tall?: boolean }) {
  const h = tall ? 34 : 22
  return (
    <g>
      <rect x="-1" y={-h} width="3" height={h + 8} fill="#5c3a22" />
      <polygon points={`2,${-h} 18,${-h + 6} 2,${-h + 12}`} fill="#9d2b2b" />
    </g>
  )
}

function Timber({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <g>
      <House tier={tier} />
      <Logs x={tier === 3 ? -62 : -50} y={2} />
      {tier >= 2 ? <circle cx="40" cy="2" r={tier === 3 ? 14 : 10} fill="none" stroke="#8a5a32" strokeWidth="3" /> : null}
      {tier === 3 ? <rect x="36" y="-8" width="8" height="20" fill="#6b4428" /> : null}
    </g>
  )
}

function Clay({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <g>
      <ellipse cx="-24" cy="6" rx={tier === 3 ? 22 : 16} ry="8" fill="#6a3d28" />
      <ellipse cx="-24" cy="4" rx={tier === 3 ? 14 : 10} ry="5" fill="#c47a48" />
      <House tier={tier} wide={tier === 1 ? 0.8 : 0.95} />
      {tier >= 2 ? <rect x="28" y="-20" width="16" height="22" fill={tier === 3 ? '#a8643c' : '#8a5a32'} /> : null}
      {tier === 3 ? <polygon points="28,-20 36,-32 44,-20" fill="#7c2f2c" /> : null}
    </g>
  )
}

function Iron({ tier }: { tier: 1 | 2 | 3 }) {
  const hill = tier === 3 ? '#6a737c' : '#4e575f'
  return (
    <g>
      <polygon points={tier === 3 ? '-48,8 0,-36 48,8' : '-36,8 0,-24 36,8'} fill={hill} />
      <ellipse cx="0" cy="2" rx={tier === 1 ? 8 : 12} ry={tier === 1 ? 8 : 12} fill="#1a1c1e" />
      {tier >= 2 ? <rect x="-16" y="-28" width="10" height="18" fill="#c4bbb0" /> : null}
      {tier === 3 ? <polygon points="-16,-28 -11,-40 -6,-28" fill="#3e4c5c" /> : null}
      <rect x="-18" y="2" width="36" height="6" fill="#5c3a22" />
    </g>
  )
}

function Farm({ tier }: { tier: 1 | 2 | 3 }) {
  const rows = tier === 1 ? 2 : tier === 2 ? 3 : 4
  return (
    <g>
      {Array.from({ length: rows }, (_, index) => (
        <rect key={index} x={-46 + index * 12} y="-6" width="8" height="16" rx="2" fill={index % 2 ? '#6d8a48' : '#8eaf62'} />
      ))}
      <House tier={tier} wide={0.85} tall={tier === 3 ? 1.15 : 0.9} />
      {tier >= 2 ? <circle cx="34" cy="-6" r="8" fill="#d2ae62" /> : null}
    </g>
  )
}

function Warehouse({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <g>
      <House tier={tier} wide={tier === 1 ? 1.15 : 1.35} tall={tier === 3 ? 1.15 : 0.9} />
      <rect x="24" y="-4" width="12" height="10" fill="#8a5a32" />
      <rect x="28" y="-12" width="12" height="10" fill="#a56b3c" />
      {tier === 3 ? <rect x="-40" y="-8" width="12" height="14" fill="#c4bbb0" /> : null}
    </g>
  )
}

function Barracks({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <g>
      <House tier={tier} wide={1.25} tall={tier === 3 ? 1.1 : 0.85} />
      <g transform="translate(-36 -8)">
        <Spears />
      </g>
      {tier >= 2 ? (
        <g transform="translate(36 -8)">
          <Spears />
        </g>
      ) : null}
    </g>
  )
}

function Stable({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <g>
      <House tier={tier} wide={1.1} />
      <path d="M-40 8 H40" stroke="#5c3a22" strokeWidth="3" />
      <path d="M-34 8 V-4 M-10 8 V-4 M14 8 V-4 M34 8 V-4" stroke="#5c3a22" strokeWidth="2" />
      {tier >= 2 ? <path d="M18 4 Q26 -8 34 4" fill="none" stroke="#3a2418" strokeWidth="2" /> : null}
      {tier === 3 ? <rect x="-46" y="-16" width="12" height="24" fill="#f4ecdf" /> : null}
    </g>
  )
}

function Workshop({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <g>
      <House tier={tier} />
      <g transform="translate(36 0)">
        <rect x="-12" y="-2" width="24" height="8" rx="2" fill="#5c3a22" />
        <circle cx="-8" cy="8" r="4" fill="#3a2418" />
        <circle cx="8" cy="8" r="4" fill="#3a2418" />
        <polygon points="0,-16 8,-2 -8,-2" fill="#8e867c" />
      </g>
      {tier === 3 ? <rect x="-46" y="-28" width="10" height="30" fill="#c4bbb0" /> : null}
    </g>
  )
}

function Smithy({ tier }: { tier: 1 | 2 | 3 }) {
  const stack = tier === 1 ? -36 : tier === 2 ? -42 : -46
  return (
    <g>
      <House tier={tier} />
      <rect x="8" y={stack} width="8" height="14" fill="#5c4030" />
      <circle cx="16" cy={stack - 5} r={tier === 1 ? 3.5 : 5} fill="#efe6d4" opacity="0.75" />
      {tier >= 2 ? <circle cx="23" cy={stack - 11} r="3.5" fill="#efe6d4" opacity="0.4" /> : null}
      <g transform="translate(-36 2)">
        <Anvil />
      </g>
    </g>
  )
}

function Market({ tier }: { tier: 1 | 2 | 3 }) {
  const left = tier === 3 ? '#7c2f2c' : tier === 2 ? '#3e4c5c' : '#a33b32'
  const right = tier === 3 ? '#e2b45a' : '#d2ae62'
  return (
    <g>
      {tier >= 2 ? <House tier={tier} wide={0.9} tall={0.85} /> : null}
      <polygon points="-36,0 -18,-22 0,0" fill={left} />
      <polygon points="-4,0 14,-22 32,0" fill={right} />
      <rect x="-34" y="0" width="64" height="6" fill="#5c3a22" />
      {tier === 3 ? (
        <g transform="translate(0 -22)">
          <Flag />
        </g>
      ) : null}
    </g>
  )
}

function Rally({ tier }: { tier: 1 | 2 | 3 }) {
  const ground = tier === 1 ? '#6b5344' : tier === 2 ? '#9a9186' : '#d9cdb8'
  return (
    <g>
      <ellipse cx="0" cy="6" rx={tier === 3 ? 40 : 32} ry="12" fill={ground} />
      {tier >= 2 ? <ellipse cx="0" cy="6" rx="22" ry="7" fill="none" stroke="#4a4038" strokeWidth="2" /> : null}
      <Flag tall={tier >= 2} />
      {tier === 3 ? (
        <g transform="translate(24 0)">
          <Flag />
        </g>
      ) : null}
    </g>
  )
}

function Academy({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <g>
      <House tier={tier} tall={tier === 3 ? 1.2 : 1} wide={tier === 1 ? 0.9 : 1.05} flag />
      {tier === 3 ? (
        <>
          <rect x="-22" y="-20" width="5" height="26" fill="#f4ecdf" />
          <rect x="16" y="-20" width="5" height="26" fill="#f4ecdf" />
        </>
      ) : null}
    </g>
  )
}

function Headquarters({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <g>
      <House tier={tier} wide={tier === 1 ? 1.05 : 1.15} tall={tier === 3 ? 1.25 : 1.05} flag />
    </g>
  )
}
