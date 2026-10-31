import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BUILDINGS } from '@/game/config/buildings.ts'
import { BUILDING_IDS, type BuildingId } from '@/game/config/ids.ts'
import { townPoints } from '@/game/sim/formulas.ts'
import { Dialog, DialogContent } from '@/components/ui/dialog.tsx'
import { BuildingDetail } from './building-detail.tsx'
import { paintTown } from './town-art.ts'
import { useGame } from './game-context.tsx'
import { CENTER, SCENE_H, SCENE_W, WALL_R, buildingPlots } from './town-layout.ts'

const PLOTS = buildingPlots()

export function TownScene() {
  const { state, build } = useGame()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [openId, setOpenId] = useState<BuildingId | null>(null)
  const [hoverId, setHoverId] = useState<BuildingId | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const town = state?.towns.find((entry) => entry.id === state.selectedTownId && entry.ownerId === state.playerId) ?? null
  const levels = town ? BUILDING_IDS.map((id) => town.buildings[id]).join(',') : ''
  const queued = town ? town.buildQueue.map((job) => job.buildingId).join(',') : ''
  const signature = town ? `${town.id}|${levels}|${queued}|${openId ?? ''}|${hoverId ?? ''}` : ''

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !town) return
    paintTown(ctx, {
      levels: town.buildings,
      queued: new Set(town.buildQueue.map((job) => job.buildingId)),
      points: townPoints(town),
      seed: town.id,
      active: openId ?? hoverId,
    })
  }, [signature])

  if (!state || !town) return null

  const open = (id: BuildingId) => {
    setNote(null)
    setOpenId(id)
  }
  const onKey = (id: BuildingId) => (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    open(id)
  }

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-[#3f6a32]" data-town-view>
      <div className="relative" style={{ aspectRatio: `${SCENE_W} / ${SCENE_H}` }}>
        <canvas
          ref={canvasRef}
          width={SCENE_W}
          height={SCENE_H}
          className="town-canvas absolute inset-0 h-full w-full"
          aria-hidden="true"
        />
        <svg viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} className="absolute inset-0 h-full w-full" role="img" aria-label={`${town.name}, town`}>
          <circle
            cx={CENTER.x}
            cy={CENTER.y}
            r={WALL_R + 4}
            fill="none"
            stroke="transparent"
            strokeWidth="14"
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            aria-label={`Wall, level ${town.buildings.wall}`}
            onClick={() => open('wall')}
            onKeyDown={onKey('wall')}
            onMouseEnter={() => setHoverId('wall')}
            onMouseLeave={() => setHoverId(null)}
          />
          {PLOTS.map((plot) => (
            <ellipse
              key={plot.id}
              cx={plot.x}
              cy={plot.y - 8}
              rx={plot.id === 'headquarters' ? 22 : 16}
              ry={plot.id === 'headquarters' ? 18 : 14}
              fill="transparent"
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${BUILDINGS[plot.id].name}, level ${town.buildings[plot.id]}`}
              onClick={() => open(plot.id)}
              onKeyDown={onKey(plot.id)}
              onMouseEnter={() => setHoverId(plot.id)}
              onMouseLeave={() => setHoverId(null)}
            />
          ))}
        </svg>
      </div>
      <p className="border-t border-line bg-[#16130f] px-4 py-2 text-xs text-faint">
        Click a building to open it. Empty plots are unbuilt. The city fills in as its points rise.
      </p>
      <Dialog
        open={openId != null}
        onOpenChange={(next) => {
          if (!next) setOpenId(null)
        }}
      >
        <DialogContent>
          {openId ? <BuildingDetail id={openId} titleAs="dialog" onBuild={(id) => setNote(build(id))} /> : null}
          {note ? <p className="mt-3 text-sm text-blood">{note}</p> : null}
        </DialogContent>
      </Dialog>
    </section>
  )
}
