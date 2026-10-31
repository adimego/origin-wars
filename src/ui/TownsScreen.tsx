import { UNIT_IDS } from '@/game/config/ids.ts'
import { populationCapacity, townPoints, townProduction } from '@/game/sim/formulas.ts'
import { townPopulationUsed } from '@/game/sim/population.ts'
import { Button } from '@/components/ui/button.tsx'
import { coords, formatCount, formatRate } from './format.ts'
import { useGame } from './game-context.tsx'

export function TownsScreen() {
  const { state, selectTown } = useGame()
  if (!state) return null
  const owned = state.towns.filter((town) => town.ownerId === state.playerId)
  if (owned.length === 0) {
    return (
      <div>
        <h1 className="font-display text-3xl">Towns</h1>
        <p className="mt-3 text-sm text-muted">You hold nothing. A siege that holds until the clock ends is how a town changes hands.</p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl">Towns</h1>
        <p className="mt-1 text-sm text-muted">
          {owned.length === 1 ? 'One holding. Loyalty is how the next one is taken.' : `${owned.length} holdings. Switch the one you are running.`}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {owned.map((town) => {
          const rates = townProduction(town)
          const troops = UNIT_IDS.reduce((sum, id) => sum + town.units[id], 0)
          const active = town.id === state.selectedTownId
          return (
            <article key={town.id} className={`rounded-lg border p-4 ${active ? 'border-brass bg-brass/5' : 'border-line bg-panel'}`}>
              <h2 className="font-display text-xl">
                {town.name} <span className="num text-sm text-brass">{coords(town.x, town.y)}</span>
              </h2>
              <p className="mt-1 text-sm text-muted">
                {townPoints(town)} points · {troops} troops at home
                {state.sieges.some((siege) => siege.townId === town.id) ? ' · under siege' : ''}
              </p>
              <p className="num mt-2 text-xs text-faint">
                +{formatRate(rates.wood)} / +{formatRate(rates.clay)} / +{formatRate(rates.iron)} per game hour · pop{' '}
                {formatCount(townPopulationUsed(town, state))}/{formatCount(populationCapacity(town.buildings.farm))}
              </p>
              <Button className="mt-3" size="sm" variant={active ? 'secondary' : 'default'} onClick={() => selectTown(town.id, true)}>
                {active ? 'Operating here' : 'Operate from here'}
              </Button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
