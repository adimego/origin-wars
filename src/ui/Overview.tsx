import { BUILDINGS } from '@/game/config/buildings.ts'
import { UNITS } from '@/game/config/units.ts'
import { UNIT_IDS } from '@/game/config/ids.ts'
import { populationCapacity, townPoints, townProduction } from '@/game/sim/formulas.ts'
import { townPopulationUsed } from '@/game/sim/population.ts'
import { useGame } from './game-context.tsx'
import { coords, formatCount, formatRate, realLeft, formatReal } from './format.ts'
import { Panel } from './bits.tsx'
import { TownScene } from './TownScene.tsx'
import { Button } from '@/components/ui/button.tsx'

export function Overview() {
  const { state, realNow, setScreen } = useGame()
  if (!state) return null
  const town = state.towns.find((entry) => entry.id === state.selectedTownId)
  if (!town || town.ownerId !== state.playerId) {
    return <p className="text-muted">You do not hold a town. Reports and the map are still open.</p>
  }
  const rates = townProduction(town)
  const pop = townPopulationUsed(town, state)
  const cap = populationCapacity(town.buildings.farm)
  const storage = town.buildings.warehouse
  const incoming = state.movements.filter(
    (movement) => movement.targetTownId === town.id && movement.mission !== 'return' && movement.mission !== 'trade',
  )
  const goals = campaignGoals(state)

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs tracking-[0.2em] text-faint">YOUR HOLDING</p>
        <h1 className="font-display text-3xl text-parchment">
          {town.name}{' '}
          <span className="num text-lg text-brass">
            {coords(town.x, town.y)}
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted">{townPoints(town)} points · rates are per game hour</p>
      </div>

      {incoming.length > 0 ? (
        <div className="rounded-lg border border-blood/50 bg-blood/10 px-4 py-3 text-sm">
          <p className="font-medium text-blood">
            {incoming.length} column{incoming.length === 1 ? '' : 's'} inbound
          </p>
          <ul className="mt-1 space-y-1 text-muted">
            {incoming.map((movement) => {
              const from = state.towns.find((entry) => entry.id === movement.originTownId)
              return (
                <li key={movement.id}>
                  {movement.mission} from {from?.name ?? 'somewhere'} · {formatReal(realLeft(state, realNow, movement.arrivesAt))}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <TownScene />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Fields">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between">
              <span className="text-wood">Wood</span>
              <span className="num">+{formatRate(rates.wood)}/h</span>
            </li>
            <li className="flex justify-between">
              <span className="text-clay">Clay</span>
              <span className="num">+{formatRate(rates.clay)}/h</span>
            </li>
            <li className="flex justify-between">
              <span className="text-iron">Iron</span>
              <span className="num">+{formatRate(rates.iron)}/h</span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-faint">Warehouse level {storage}. Full sheds stop the saws.</p>
        </Panel>
        <Panel title="People">
          <div className="h-2 overflow-hidden rounded-full bg-ink">
            <div className="h-full bg-moss" style={{ width: `${Math.min(100, cap ? (pop / cap) * 100 : 0)}%` }} />
          </div>
          <p className="num mt-2 text-sm">
            {formatCount(pop)} / {formatCount(cap)}
          </p>
          <p className="mt-2 text-xs text-faint">The farm is the cap. Troops away from home still eat.</p>
          <p className="mt-3 text-xs text-muted">
            A raid carries off goods. A siege stays. The town falls only if the camp is still standing when the clock ends.
          </p>
        </Panel>
        <Panel title="What to do next">
          <ul className="space-y-2 text-sm">
            {goals.map((goal) => (
              <li key={goal.id} className={goal.done ? 'text-moss' : 'text-parchment'}>
                {goal.done ? 'Done' : 'Open'} · {goal.label}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Build queue"
          action={
            <Button size="sm" variant="ghost" onClick={() => setScreen('buildings')}>
              Buildings
            </Button>
          }
        >
          {town.buildQueue.length === 0 ? (
            <p className="text-sm text-muted">Nothing on the scaffold. The timber camp can go up first, or the barracks.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {town.buildQueue.map((job, index) => (
                <li key={`${job.buildingId}-${job.targetLevel}`} className="flex justify-between gap-3">
                  <span>
                    {BUILDINGS[job.buildingId].name} → {job.targetLevel}
                    {index > 0 ? <span className="text-faint"> · waiting</span> : null}
                  </span>
                  <span className="num text-muted">
                    {job.completesAt == null ? '—' : formatReal(realLeft(state, realNow, job.completesAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel
          title="Garrison"
          action={
            <Button size="sm" variant="ghost" onClick={() => setScreen('recruit')}>
              Recruit
            </Button>
          }
        >
          <UnitList units={town.units} empty="No company at home. The barracks is how that changes." />
          {town.support.length > 0 ? (
            <p className="mt-3 text-xs text-muted">{town.support.length} supporting column{town.support.length === 1 ? '' : 's'} on the wall.</p>
          ) : null}
          <QueueBits />
        </Panel>
      </div>
    </div>
  )
}

function UnitList({ units, empty }: { units: Record<(typeof UNIT_IDS)[number], number>; empty: string }) {
  const rows = UNIT_IDS.filter((id) => units[id] > 0)
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {rows.map((id) => (
        <li key={id} className="flex justify-between">
          <span>{UNITS[id].name}</span>
          <span className="num">{units[id]}</span>
        </li>
      ))}
    </ul>
  )
}

function QueueBits() {
  const { state, realNow } = useGame()
  const town = state?.towns.find((entry) => entry.id === state.selectedTownId)
  if (!town || !state) return null
  const jobs = (['barracks', 'stable', 'workshop', 'academy'] as const)
    .map((building) => ({ building, job: town.recruitQueues[building] }))
    .filter((entry) => entry.job)
  if (jobs.length === 0 && !town.researchJob) return null
  return (
    <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
      {jobs.map(({ building, job }) =>
        job ? (
          <li key={building}>
            {BUILDINGS[building].name}: {job.remaining} {UNITS[job.unitId].name.toLowerCase()}
            {job.remaining === 1 ? '' : 's'} · next {formatReal(realLeft(state, realNow, job.nextAt))}
          </li>
        ) : null,
      )}
      {town.researchJob ? (
        <li>
          Smithy: {UNITS[town.researchJob.unitId].name} research → {town.researchJob.targetLevel}
        </li>
      ) : null}
    </ul>
  )
}

function campaignGoals(state: NonNullable<ReturnType<typeof useGame>['state']>) {
  const towns = state.towns.filter((town) => town.ownerId === state.playerId)
  const player = state.owners.find((owner) => owner.id === state.playerId)
  let troops = 0
  for (const town of towns) {
    for (const id of UNIT_IDS) troops += town.units[id]
    for (const job of Object.values(town.recruitQueues)) if (job) troops += job.remaining
  }
  for (const movement of state.movements) {
    if (movement.ownerId !== state.playerId) continue
    for (const id of UNIT_IDS) troops += movement.units[id]
  }
  const raided = state.reports.some(
    (report) =>
      report.ownerId === state.playerId &&
      report.battle?.attackerWins &&
      report.battle.attackerName === player?.name,
  )
  return [
    { id: 'barracks', label: 'Raise a barracks', done: towns.some((town) => town.buildings.barracks >= 1) },
    { id: 'company', label: 'Field a company of 8', done: troops >= 8 },
    { id: 'raid', label: 'Win a battle and bring something home', done: raided },
    { id: 'second', label: 'Hold a siege until a second town falls', done: towns.length >= 2 },
  ]
}
