import { useState } from 'react'
import { BUILDINGS, BUILDING_GROUPS } from '@/game/config/buildings.ts'
import type { BuildingId } from '@/game/config/ids.ts'
import { queueSlots } from '@/game/sim/formulas.ts'
import { Button } from '@/components/ui/button.tsx'
import { Panel } from './bits.tsx'
import { BuildingDetail } from './building-detail.tsx'
import { MarketDesk } from './building-use.tsx'
import { formatReal, realLeft } from './format.ts'
import { useGame } from './game-context.tsx'

export function BuildingsScreen() {
  const { state, realNow, build, cancelBuild } = useGame()
  const [note, setNote] = useState<string | null>(null)
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId && entry.ownerId === state.playerId)
  if (!town) return <p className="text-muted">No town to build in.</p>
  const slots = queueSlots(town.buildings.headquarters)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl">Buildings</h1>
        <p className="mt-1 text-sm text-muted">
          Queue {town.buildQueue.length}/{slots}. The headquarters shortens the rest. Cancel the last order if you change your mind.
        </p>
      </div>
      <Panel
        title="Queue"
        action={
          <Button
            size="sm"
            variant="secondary"
            disabled={town.buildQueue.length === 0}
            onClick={() => setNote(cancelBuild())}
          >
            Cancel last
          </Button>
        }
      >
        {town.buildQueue.length === 0 ? (
          <p className="text-sm text-muted">The yard is empty.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {town.buildQueue.map((job, index) => (
              <li key={`${job.buildingId}-${job.targetLevel}`} className="flex justify-between gap-3">
                <span>
                  {index === 0 ? 'Raising' : 'Waiting'} {BUILDINGS[job.buildingId].name} to {job.targetLevel}
                </span>
                <span className="num text-muted">
                  {job.completesAt == null ? 'after the current job' : formatReal(realLeft(state, realNow, job.completesAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {note ? <p className="mt-3 text-sm text-blood">{note}</p> : null}
      </Panel>

      {BUILDING_GROUPS.map((group) => (
        <section key={group.id}>
          <h2 className="mb-2 text-xs tracking-[0.2em] text-faint">{group.label.toUpperCase()}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {group.ids.map((id) => (
              <BuildingCard
                key={id}
                id={id}
                onBuild={(buildingId) => setNote(build(buildingId))}
              />
            ))}
          </div>
        </section>
      ))}

      <Panel title="Market desk">
        <MarketDesk />
      </Panel>
    </div>
  )
}

function BuildingCard({ id, onBuild }: { id: BuildingId; onBuild: (id: BuildingId) => void }) {
  return (
    <article className="rounded-lg border border-line bg-panel p-4">
      <BuildingDetail id={id} onBuild={onBuild} />
    </article>
  )
}
