import { BUILDINGS } from '@/game/config/buildings.ts'
import type { BuildingId } from '@/game/config/ids.ts'
import { COMBAT } from '@/game/config/world.ts'
import { explainBuild } from '@/game/sim/buildings.ts'
import {
  buildCost,
  buildTimeMs,
  populationCapacity,
  productionPerHour,
  requirementText,
  storageCapacity,
} from '@/game/sim/formulas.ts'
import { Button } from '@/components/ui/button.tsx'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx'
import { CostLine } from './bits.tsx'
import { formatCount, formatRate, formatReal } from './format.ts'
import { useGame } from './game-context.tsx'

export function BuildingDetail({
  id,
  onBuild,
  titleAs = 'h3',
}: {
  id: BuildingId
  onBuild: (id: BuildingId) => void
  titleAs?: 'h3' | 'dialog'
}) {
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
  const queued = town.buildQueue.some((job) => job.buildingId === id)
  const Title = titleAs === 'dialog' ? DialogTitle : 'h3'

  return (
    <div>
      {titleAs === 'dialog' ? <DialogDescription className="sr-only">{def.blurb}</DialogDescription> : null}
      <div className="flex items-baseline justify-between gap-3 pr-6">
        <Title className="font-medium">{def.name}</Title>
        <span className="num text-sm text-brass">Lv {level}</span>
      </div>
      <p className="mt-1 text-sm text-muted">{def.blurb}</p>
      <p className="mt-2 text-xs text-faint">{effectLine(id, level)}</p>
      {req ? <p className="mt-2 text-xs text-faint">Requires {req}</p> : null}
      {queued ? <p className="mt-2 text-xs text-brass-2">Scaffolding is up.</p> : null}
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
    </div>
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
