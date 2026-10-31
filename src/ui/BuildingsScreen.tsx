import { useState } from 'react'
import { BUILDINGS, BUILDING_GROUPS } from '@/game/config/buildings.ts'
import type { BuildingId, ResourceKey } from '@/game/config/ids.ts'
import { WORLD } from '@/game/config/world.ts'
import { queueSlots } from '@/game/sim/formulas.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Panel } from './bits.tsx'
import { BuildingDetail } from './building-detail.tsx'
import { formatReal, realLeft } from './format.ts'
import { useGame } from './game-context.tsx'

export function BuildingsScreen() {
  const { state, realNow, build, cancelBuild, exchange } = useGame()
  const [note, setNote] = useState<string | null>(null)
  const [give, setGive] = useState<ResourceKey>('wood')
  const [receive, setReceive] = useState<ResourceKey>('iron')
  const [amount, setAmount] = useState(200)
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
        {town.buildings.market < 1 ? (
          <p className="text-sm text-muted">A market lets you swap goods at a loss, or send them to another town you hold.</p>
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              setNote(exchange(give, receive, amount))
            }}
          >
            <label className="text-xs text-muted">
              Give
              <select className="mt-1 block rounded-md border border-line bg-ink px-2 py-2 text-sm" value={give} onChange={(event) => setGive(event.target.value as ResourceKey)}>
                <option value="wood">Wood</option>
                <option value="clay">Clay</option>
                <option value="iron">Iron</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Receive
              <select className="mt-1 block rounded-md border border-line bg-ink px-2 py-2 text-sm" value={receive} onChange={(event) => setReceive(event.target.value as ResourceKey)}>
                <option value="wood">Wood</option>
                <option value="clay">Clay</option>
                <option value="iron">Iron</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Amount
              <Input
                className="mt-1 w-28"
                type="number"
                min={WORLD.market.minShipment}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
              />
            </label>
            <Button type="submit">Trade</Button>
            <p className="text-xs text-faint">
              Merchants keep {Math.round(WORLD.market.loss * 100)}%. You would receive {Math.floor(amount * (1 - WORLD.market.loss))}.
            </p>
          </form>
        )}
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
