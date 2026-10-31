import { useState } from 'react'
import { BUILDINGS, BUILDING_GROUPS } from '@/game/config/buildings.ts'
import type { BuildingId, ResourceKey } from '@/game/config/ids.ts'
import { COMBAT, WORLD } from '@/game/config/world.ts'
import { explainBuild } from '@/game/sim/buildings.ts'
import {
  buildCost,
  buildTimeMs,
  populationCapacity,
  productionPerHour,
  queueSlots,
  requirementText,
  storageCapacity,
} from '@/game/sim/formulas.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { CostLine, Panel } from './bits.tsx'
import { formatCount, formatRate, formatReal, realLeft } from './format.ts'
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
  const { state } = useGame()
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId)
  if (!town) return null
  const def = BUILDINGS[id]
  const level = town.buildings[id]
  const maxed = level >= def.maxLevel
  const reason = maxed ? null : explainBuild(town, id)
  const cost = maxed ? null : buildCost(id, level + 1)
  const time = maxed ? 0 : buildTimeMs(id, level + 1, town.buildings.headquarters)
  const req = requirementText(id)

  return (
    <article className="rounded-lg border border-line bg-panel p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium">{def.name}</h3>
        <span className="num text-sm text-brass">Lv {level}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{def.blurb}</p>
      <p className="mt-2 text-xs text-faint">{effectLine(id, level)}</p>
      {req ? <p className="mt-2 text-xs text-faint">Requires {req}</p> : null}
      {cost ? (
        <p className="mt-3">
          <CostLine cost={cost} />
          <span className="num ml-3 text-xs text-muted">{formatReal(time / state.speed)}</span>
        </p>
      ) : (
        <p className="mt-3 text-xs text-moss">Highest level.</p>
      )}
      <div className="mt-3">
        <Button size="sm" disabled={maxed || reason != null} onClick={() => onBuild(id)}>
          {maxed ? 'Finished' : `Raise to ${level + 1}`}
        </Button>
        {reason ? <p className="mt-2 text-xs text-blood">{reason}</p> : null}
      </div>
    </article>
  )
}

function effectLine(id: BuildingId, level: number): string {
  const def = BUILDINGS[id]
  if (def.production) {
    const now = productionPerHour(def, level)
    const next = level >= def.maxLevel ? now : productionPerHour(def, level + 1)
    return `${formatRate(now)}/h now${level >= def.maxLevel ? '' : ` · ${formatRate(next)}/h next`}`
  }
  if (id === 'warehouse') return `Holds ${formatCount(storageCapacity(level))}`
  if (id === 'farm') return `Feeds ${formatCount(populationCapacity(level))}`
  if (id === 'wall') return level ? `Defense ×${(COMBAT.wallMultiplierPerLevel ** level).toFixed(2)}` : 'No bonus yet'
  if (id === 'market') return level ? `${level} merchant${level === 1 ? '' : 's'}` : 'No merchants'
  if (id === 'headquarters') return 'Each level shortens other construction'
  if (id === 'rally') return level ? 'Armies can form here' : 'Required before a march'
  if (id === 'smithy') return level ? `Can research to level ${level}` : 'Research stays locked'
  return level ? 'In use' : 'Not raised'
}
