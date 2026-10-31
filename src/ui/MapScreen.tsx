import { useEffect, useMemo, useRef, useState } from 'react'
import { UNIT_IDS } from '@/game/config/ids.ts'
import { UNITS } from '@/game/config/units.ts'
import { distance } from '@/game/sim/movement.ts'
import { terrainAt, type Terrain } from '@/game/sim/terrain.ts'
import { townPoints } from '@/game/sim/formulas.ts'
import type { Town } from '@/game/sim/types.ts'
import { Button } from '@/components/ui/button.tsx'
import { CommandDialog, type OrderMission } from './CommandDialog.tsx'
import { coords, formatCount } from './format.ts'
import { useGame } from './game-context.tsx'

const TILE = 44

const TERRAIN: Record<Terrain, string> = {
  plain: 'bg-[#24352b]',
  forest: 'bg-[#183028]',
  hill: 'bg-[#3a3226]',
  field: 'bg-[#3c3a26]',
  water: 'bg-[#163240]',
}

export function MapScreen() {
  const { state } = useGame()
  const scroller = useRef<HTMLDivElement>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [order, setOrder] = useState<OrderMission | null>(null)
  const centered = useRef<string | null>(null)

  const home = state?.towns.find((town) => town.id === state.selectedTownId)
  useEffect(() => {
    const el = scroller.current
    if (!el || !home || centered.current === home.id) return
    centered.current = home.id
    el.scrollTo({
      left: home.x * TILE - el.clientWidth / 2 + TILE / 2,
      top: home.y * TILE - el.clientHeight / 2 + TILE / 2,
    })
  }, [home])

  const byTile = useMemo(() => {
    const map = new Map<string, Town>()
    for (const town of state?.towns ?? []) map.set(`${town.x},${town.y}`, town)
    return map
  }, [state?.towns])

  if (!state || !home) return <p className="text-muted">The map is still there, but you have no town to measure from.</p>
  const focus = state.towns.find((town) => town.id === focusId) ?? null

  const cells = []
  for (let y = 0; y < state.mapHeight; y++) {
    for (let x = 0; x < state.mapWidth; x++) {
      const town = byTile.get(`${x},${y}`)
      const terrain = terrainAt(x, y, state.terrainSeed)
      const className = `relative ${TERRAIN[terrain]} ${focus?.id === town?.id ? 'ring-1 ring-inset ring-white' : ''}`
      cells.push(
        town ? (
          <button
            key={`${x}-${y}`}
            type="button"
            onClick={() => setFocusId(town.id)}
            className={className}
            style={{ width: TILE, height: TILE }}
            aria-label={town.name}
          >
            <Pin town={town} playerId={state.playerId} selected={town.id === home.id} />
          </button>
        ) : (
          <div key={`${x}-${y}`} className={className} style={{ width: TILE, height: TILE }} />
        ),
      )
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-3xl">Map</h1>
          <p className="text-xs text-faint">You · your other towns · rivals · abandoned</p>
        </div>
        <div ref={scroller} className="h-[68vh] min-h-[420px] overflow-auto rounded-lg border border-line bg-[#14221c]">
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${state.mapWidth}, ${TILE}px)`, width: state.mapWidth * TILE }}>
            {cells}
          </div>
        </div>
      </div>
      <aside className="rounded-lg border border-line bg-panel p-4">
        {focus ? (
          <TownPanel
            town={focus}
            home={home}
            onOrder={(mission) => setOrder(mission)}
          />
        ) : (
          <p className="text-sm text-muted">Choose a town. Abandoned hamlets are the usual first raid.</p>
        )}
      </aside>
      {order && focus ? (
        <CommandDialog key={`${focus.id}-${order}`} targetId={focus.id} mission={order} onMission={setOrder} onClose={() => setOrder(null)} />
      ) : null}
    </div>
  )
}

function Pin({ town, playerId, selected }: { town: Town; playerId: string; selected: boolean }) {
  const owned = town.ownerId === playerId
  const wild = town.ownerId === 'wild'
  const color = owned ? (selected ? 'bg-brass border-brass-2' : 'bg-moss border-moss') : wild ? 'bg-faint border-muted' : 'bg-blood border-blood'
  return (
    <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
      <span className={`h-3.5 w-3.5 rounded-[3px] border ${color}`} />
      <span className="mt-0.5 max-w-[40px] truncate text-[8px] leading-none text-parchment/90">{town.name.split(' ')[0]}</span>
    </span>
  )
}

function TownPanel({
  town,
  home,
  onOrder,
}: {
  town: Town
  home: Town
  onOrder: (mission: OrderMission) => void
}) {
  const { state } = useGame()
  if (!state) return null
  const owner = state.owners.find((entry) => entry.id === town.ownerId)
  const mine = town.ownerId === state.playerId
  const wild = owner?.kind === 'barbarian'
  const scout = state.reports.find((report) => report.ownerId === state.playerId && report.scout?.townId === town.id && report.scout.success)?.scout
  const troops = UNIT_IDS.filter((id) => town.units[id] > 0)

  return (
    <div className="space-y-3 text-sm">
      <div>
        <h2 className="font-display text-xl text-brass-2">{town.name}</h2>
        <p className="num text-xs text-brass">{coords(town.x, town.y)} · {distance(home, town).toFixed(1)} fields</p>
      </div>
      <p>{mine ? 'You' : owner?.name ?? 'Abandoned'}</p>
      <p className="text-muted">{townPoints(town)} points</p>
      {wild ? (
        troops.length === 0 ? (
          <p className="text-moss">Abandoned fields. The stores are still there.</p>
        ) : (
          <p>Stragglers: {troops.map((id) => `${town.units[id]} ${UNITS[id].name.toLowerCase()}`).join(', ')}</p>
        )
      ) : mine ? (
        <p className="text-muted">This is one of your towns.</p>
      ) : scout?.units ? (
        <p>Last scout saw {UNIT_IDS.filter((id) => (scout.units?.[id] ?? 0) > 0).map((id) => `${scout.units?.[id]} ${UNITS[id].name.toLowerCase()}`).join(', ') || 'an empty yard'}.</p>
      ) : (
        <p className="text-muted">Garrison unknown. Send scouts.</p>
      )}
      {scout?.resources ? (
        <p className="num text-xs text-faint">
          Scouted stores {formatCount(scout.resources.wood)} / {formatCount(scout.resources.clay)} / {formatCount(scout.resources.iron)}
          {state.sieges.some((siege) => siege.townId === town.id) ? ' · siege camp outside' : ''}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2 pt-1">
        {!mine ? (
          <Button size="sm" variant="secondary" onClick={() => onOrder('attack')}>
            Raid
          </Button>
        ) : null}
        {!mine ? (
          <Button size="sm" onClick={() => onOrder('siege')}>
            Besiege
          </Button>
        ) : null}
        {state.sieges.some((siege) => siege.townId === town.id && siege.attackerOwnerId !== state.playerId) ? (
          <Button size="sm" onClick={() => onOrder('relief')}>
            Send relief
          </Button>
        ) : null}
        {mine && town.id !== home.id ? (
          <Button size="sm" onClick={() => onOrder('support')}>
            Support
          </Button>
        ) : null}
        {!mine ? (
          <Button size="sm" variant="secondary" onClick={() => onOrder('scout')}>
            Scout
          </Button>
        ) : null}
        {mine && town.id !== home.id ? (
          <Button size="sm" variant="secondary" onClick={() => onOrder('supply')}>
            Send goods
          </Button>
        ) : null}
      </div>
    </div>
  )
}
