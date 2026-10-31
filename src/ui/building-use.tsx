import { useState } from 'react'
import { BUILDINGS } from '@/game/config/buildings.ts'
import type { ResourceKey, TrainBuilding, UnitId } from '@/game/config/ids.ts'
import { UNITS } from '@/game/config/units.ts'
import { WORLD } from '@/game/config/world.ts'
import { researchCost, researchTimeMs } from '@/game/sim/formulas.ts'
import { explainRecruit, explainResearch, maxAffordable } from '@/game/sim/recruit.ts'
import { Button } from '@/components/ui/button.tsx'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx'
import { Input } from '@/components/ui/input.tsx'
import { CostLine } from './bits.tsx'
import { formatReal, realLeft } from './format.ts'
import { useGame } from './game-context.tsx'
import { researchableUnits, unitsAt } from './town-panels.ts'

export function SmithyPanel() {
  const { state, realNow, research } = useGame()
  const [note, setNote] = useState<string | null>(null)
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId && entry.ownerId === state.playerId)
  if (!town) return null
  const level = town.buildings.smithy
  const job = town.researchJob

  return (
    <div>
      <DialogTitle className="pr-6 font-display text-2xl text-brass-2">Smithy</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted">
        Research a weapon or mount. Each level needs the smithy at least that high, and only one study runs at a time.
      </DialogDescription>
      {level < 1 ? (
        <p className="mt-3 text-sm text-blood">
          The smithy is an empty plot. Raise it to level 1 before any research can start.
        </p>
      ) : null}
      <div className="mt-3 rounded-md border border-line bg-ink/40 px-3 py-2 text-sm">
        {job ? (
          <p>
            Queue: {UNITS[job.unitId].name} → {job.targetLevel}
            <span className="num text-muted"> · {formatReal(realLeft(state, realNow, job.completesAt))} left</span>
          </p>
        ) : (
          <p className="text-muted">{level < 1 ? 'Nothing can be queued yet.' : 'The research queue is empty.'}</p>
        )}
      </div>
      <ul className="mt-3 space-y-3">
        {researchableUnits().map((id) => (
          <li key={id} className="rounded-md border border-line px-3 py-2">
            <ResearchLine unitId={id} onResearch={(unitId) => setNote(research(unitId))} />
          </li>
        ))}
      </ul>
      {note ? <p className="mt-3 text-sm text-blood">{note}</p> : null}
    </div>
  )
}

function ResearchLine({ unitId, onResearch }: { unitId: UnitId; onResearch: (id: UnitId) => void }) {
  const { state } = useGame()
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId)
  if (!town) return null
  const unit = UNITS[unitId]
  const current = town.research[unitId] ?? 0
  const finished = current >= unit.researchMax
  const target = current + 1
  const reason = finished ? null : explainResearch(town, unitId)
  const cost = finished ? null : researchCost(unitId, target)
  const time = finished ? 0 : researchTimeMs(unitId, target, Math.max(1, town.buildings.smithy))
  const active = town.researchJob?.unitId === unitId

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{unit.name}</p>
        <p className="num text-xs text-brass">
          {finished ? 'Finished' : `${current} / ${unit.researchMax}`}
          {active ? ' · in progress' : ''}
        </p>
      </div>
      <p className="mt-1 text-xs text-faint">{unit.blurb}</p>
      {finished ? (
        <p className="mt-2 text-xs text-moss">Research finished.</p>
      ) : (
        <>
          <p className="mt-2 text-xs text-faint">
            Requires smithy {target}
            {town.buildings.smithy < target ? ` (you have ${town.buildings.smithy})` : ''}
            {unit.requiresResearch && current < 1 ? ' · training stays locked until level 1' : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={reason != null} onClick={() => onResearch(unitId)}>
              Research
            </Button>
            {cost ? <CostLine cost={cost} /> : null}
            <span className="num text-xs text-muted">{formatReal(time / state.speed)}</span>
          </div>
          {reason ? <p className="mt-1 text-xs text-blood">{reason}</p> : null}
        </>
      )}
    </div>
  )
}

export function YardPanel({ building }: { building: TrainBuilding }) {
  const { state, realNow, recruit } = useGame()
  const [counts, setCounts] = useState<Partial<Record<UnitId, number>>>({})
  const [note, setNote] = useState<string | null>(null)
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId && entry.ownerId === state.playerId)
  if (!town) return null
  const name = BUILDINGS[building].name
  const level = town.buildings[building]
  const queue = town.recruitQueues[building]
  const units = unitsAt(building)

  return (
    <div>
      <DialogTitle className="pr-6 font-display text-2xl text-brass-2">{name}</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted">
        {units.map((id) => UNITS[id].name).join(', ')} train here.
      </DialogDescription>
      {level < 1 ? (
        <p className="mt-3 text-sm text-blood">Build a {name.toLowerCase()} before anyone can train here.</p>
      ) : null}
      <div className="mt-3 rounded-md border border-line bg-ink/40 px-3 py-2 text-sm">
        {queue ? (
          <p>
            Queue: {queue.remaining} {UNITS[queue.unitId].name.toLowerCase()}
            {queue.remaining === 1 ? '' : 's'}
            <span className="num text-muted"> · next in {formatReal(realLeft(state, realNow, queue.nextAt))}</span>
          </p>
        ) : (
          <p className="text-muted">{level < 1 ? 'Nothing can be queued yet.' : 'The training queue is empty.'}</p>
        )}
      </div>
      <ul className="mt-3 space-y-3">
        {units.map((id) => {
          const unit = UNITS[id]
          const count = counts[id] ?? 1
          const reason = explainRecruit(state, town, id, count)
          const affordable = maxAffordable(town, state, id)
          return (
            <li key={id} className="rounded-md border border-line px-3 py-2">
              <p className="font-medium">
                {unit.name} <span className="num text-xs text-faint">home {town.units[id]}</span>
              </p>
              <p className="mt-1 text-xs text-faint">{unit.blurb}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  className="w-20"
                  type="number"
                  min={1}
                  max={400}
                  value={count}
                  aria-label={`${unit.name} count`}
                  onChange={(event) => setCounts((current) => ({ ...current, [id]: Number(event.target.value) }))}
                />
                <Button size="sm" disabled={reason != null} onClick={() => setNote(recruit(id, count))}>
                  Train
                </Button>
                <CostLine cost={{ wood: unit.cost.wood * count, clay: unit.cost.clay * count, iron: unit.cost.iron * count }} />
              </div>
              {reason ? <p className="mt-1 text-xs text-blood">{reason}</p> : null}
              {affordable > 0 ? <p className="mt-1 text-xs text-faint">You can afford {affordable}.</p> : null}
            </li>
          )
        })}
      </ul>
      {note ? <p className="mt-3 text-sm text-blood">{note}</p> : null}
    </div>
  )
}

export function MarketDesk({ heading = 'plain' }: { heading?: 'dialog' | 'plain' }) {
  const { state, exchange } = useGame()
  const [give, setGive] = useState<ResourceKey>('wood')
  const [receive, setReceive] = useState<ResourceKey>('iron')
  const [amount, setAmount] = useState(200)
  const [note, setNote] = useState<string | null>(null)
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId && entry.ownerId === state.playerId)
  if (!town) return null
  const open = town.buildings.market >= 1

  return (
    <div>
      {heading === 'dialog' ? (
        <>
          <DialogTitle className="pr-6 font-display text-2xl text-brass-2">Market</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted">
            Swap goods at a loss, or send them to another town you hold from the map.
          </DialogDescription>
        </>
      ) : null}
      {!open ? (
        <p className={heading === 'dialog' ? 'mt-3 text-sm text-muted' : 'text-sm text-muted'}>
          A market lets you swap goods at a loss, or send them to another town you hold. Raise it to level 1 to open the desk.
        </p>
      ) : (
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            setNote(exchange(give, receive, amount))
          }}
        >
          <ResourcePick label="Give" value={give} onChange={setGive} />
          <ResourcePick label="Receive" value={receive} onChange={setReceive} />
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
      {note ? <p className="mt-3 text-sm text-blood">{note}</p> : null}
    </div>
  )
}

function ResourcePick({
  label,
  value,
  onChange,
}: {
  label: string
  value: ResourceKey
  onChange: (value: ResourceKey) => void
}) {
  return (
    <label className="text-xs text-muted">
      {label}
      <select
        className="mt-1 block rounded-md border border-line bg-ink px-2 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value as ResourceKey)}
      >
        <option value="wood">Wood</option>
        <option value="clay">Clay</option>
        <option value="iron">Iron</option>
      </select>
    </label>
  )
}

export function RallyPanel({ onOpenMap }: { onOpenMap: () => void }) {
  const { state } = useGame()
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId && entry.ownerId === state.playerId)
  if (!town) return null
  const level = town.buildings.rally
  const home = (Object.keys(town.units) as UnitId[]).filter((id) => town.units[id] > 0)

  return (
    <div>
      <DialogTitle className="pr-6 font-display text-2xl text-brass-2">Rally point</DialogTitle>
      <DialogDescription className="mt-1 text-sm text-muted">
        Companies form on this square. A march, scout, or supply run starts from here.
      </DialogDescription>
      {level < 1 ? (
        <p className="mt-3 text-sm text-blood">
          Build a rally point before a company can form. Marches stay locked until it stands.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">
            The square is open. Choose another town on the map to attack, scout, support, or haul goods.
          </p>
          <Button className="mt-3" onClick={onOpenMap}>
            Open the map
          </Button>
          {home.length > 0 ? (
            <ul className="mt-3 grid grid-cols-2 gap-x-4 text-sm">
              {home.map((id) => (
                <li key={id} className="flex justify-between">
                  <span>{UNITS[id].name}</span>
                  <span className="num">{town.units[id]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-faint">No company is home yet. The barracks is where that starts.</p>
          )}
        </>
      )}
    </div>
  )
}
