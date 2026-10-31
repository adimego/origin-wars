import { useState } from 'react'
import { BUILDINGS } from '@/game/config/buildings.ts'
import { UNIT_IDS, type UnitId } from '@/game/config/ids.ts'
import { UNITS } from '@/game/config/units.ts'
import { researchCost, researchTimeMs } from '@/game/sim/formulas.ts'
import { explainRecruit, explainResearch, maxAffordable, unitUnlocked } from '@/game/sim/recruit.ts'
import { Button } from '@/components/ui/button.tsx'
import { Input } from '@/components/ui/input.tsx'
import { CostLine } from './bits.tsx'
import { formatReal, realLeft } from './format.ts'
import { useGame } from './game-context.tsx'

export function RecruitScreen() {
  const { state, realNow, recruit, research } = useGame()
  const [counts, setCounts] = useState<Partial<Record<UnitId, number>>>({})
  const [note, setNote] = useState<string | null>(null)
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId && entry.ownerId === state.playerId)
  if (!town) return <p className="text-muted">No town to recruit in.</p>

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl">Recruit</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Spears hold cavalry. Swords hold infantry. Axes and light cavalry take ground and loot. Scouts buy you a look.
          A commander, or enough rams and catapults, lets a winning army invest the town and sit out a siege.
        </p>
      </div>
      {note ? <p className="text-sm text-blood">{note}</p> : null}
      <div className="grid gap-3">
        {UNIT_IDS.map((id) => {
          const unit = UNITS[id]
          const count = counts[id] ?? 1
          const unlocked = unitUnlocked(town, id)
          const affordable = maxAffordable(town, state, id)
          const reason = unlocked ? explainRecruit(state, town, id, count) : null
          const queue = town.recruitQueues[unit.trainBuilding]
          return (
            <article key={id} className="rounded-lg border border-line bg-panel p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">
                  {unit.name}{' '}
                  <span className="text-xs text-faint">
                    home {town.units[id]} · pop {unit.pop} · {BUILDINGS[unit.trainBuilding].name}
                  </span>
                </h2>
                {(town.research[id] ?? 0) > 0 ? (
                  <span className="text-xs text-brass">Research {town.research[id]}</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-muted">{unit.blurb}</p>
              <p className="num mt-2 text-xs text-faint">
                Atk {unit.attack} · Def inf {unit.defInfantry} · Def cav {unit.defCavalry} · Carry {unit.carry} ·{' '}
                {formatReal(unit.trainBaseMs / state.speed)} each at level 1
              </p>
              {queue && queue.unitId === id ? (
                <p className="mt-2 text-xs text-muted">
                  {queue.remaining} in the yard · next in {formatReal(realLeft(state, realNow, queue.nextAt))}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Input
                  className="w-24"
                  type="number"
                  min={1}
                  max={400}
                  value={count}
                  onChange={(event) => setCounts((current) => ({ ...current, [id]: Number(event.target.value) }))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={affordable < 1}
                  onClick={() => setCounts((current) => ({ ...current, [id]: Math.max(1, affordable) }))}
                >
                  Max {affordable}
                </Button>
                <Button size="sm" disabled={!unlocked || reason != null} onClick={() => setNote(recruit(id, count))}>
                  Train
                </Button>
                <CostLine cost={{ wood: unit.cost.wood * count, clay: unit.cost.clay * count, iron: unit.cost.iron * count }} />
              </div>
              {!unlocked ? (
                <p className="mt-2 text-xs text-blood">
                  {town.buildings[unit.trainBuilding] < 1
                    ? `Build a ${BUILDINGS[unit.trainBuilding].name.toLowerCase()} first.`
                    : `Research ${unit.name.toLowerCase()}s at the smithy.`}
                </p>
              ) : reason ? (
                <p className="mt-2 text-xs text-blood">{reason}</p>
              ) : null}
              {unit.researchMax > 0 ? (
                <ResearchRow unitId={id} onResearch={(unitId) => setNote(research(unitId))} />
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function ResearchRow({ unitId, onResearch }: { unitId: UnitId; onResearch: (id: UnitId) => void }) {
  const { state, realNow } = useGame()
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId)
  if (!town) return null
  const unit = UNITS[unitId]
  const current = town.research[unitId] ?? 0
  if (current >= unit.researchMax) return <p className="mt-3 text-xs text-moss">Research finished.</p>
  const target = current + 1
  const reason = explainResearch(town, unitId)
  const cost = researchCost(unitId, target)
  const time = researchTimeMs(unitId, target, Math.max(1, town.buildings.smithy))
  const active = town.researchJob?.unitId === unitId
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-xs text-muted">
        Smithy research → {target}
        {active && town.researchJob
          ? ` · finishes in ${formatReal(realLeft(state, realNow, town.researchJob.completesAt))}`
          : ''}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={reason != null} onClick={() => onResearch(unitId)}>
          Research
        </Button>
        <CostLine cost={cost} />
        <span className="num text-xs text-faint">{formatReal(time / state.speed)}</span>
      </div>
      {reason ? <p className="mt-1 text-xs text-blood">{reason}</p> : null}
    </div>
  )
}
