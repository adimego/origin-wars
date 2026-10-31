import { useState } from 'react'
import { BUILDINGS } from '@/game/config/buildings.ts'
import { BUILDING_IDS, UNIT_IDS, type BuildingId, type Resources } from '@/game/config/ids.ts'
import { UNITS } from '@/game/config/units.ts'
import { distance, merchantTravelMs, travelMs } from '@/game/sim/movement.ts'
import { siegeDurationMs, siegeWeight } from '@/game/sim/siege.ts'
import { townPoints } from '@/game/sim/formulas.ts'
import { SIEGE } from '@/game/config/world.ts'
import { hasUnits } from '@/game/sim/defaults.ts'
import { Button } from '@/components/ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx'
import { Input } from '@/components/ui/input.tsx'
import { coords, formatReal } from './format.ts'
import { useGame } from './game-context.tsx'

export type OrderMission = 'attack' | 'siege' | 'relief' | 'support' | 'scout' | 'supply'

export function CommandDialog({
  targetId,
  mission,
  onMission,
  onClose,
}: {
  targetId: string
  mission: OrderMission
  onMission: (mission: OrderMission) => void
  onClose: () => void
}) {
  const { state, send, ship } = useGame()
  const [fromId, setFromId] = useState(state?.selectedTownId ?? '')
  const [counts, setCounts] = useState<Partial<Record<(typeof UNIT_IDS)[number], number>>>({})
  const [targetBuilding, setTargetBuilding] = useState<BuildingId>('wall')
  const [cargo, setCargo] = useState<Resources>({ wood: 0, clay: 0, iron: 0 })
  const [error, setError] = useState<string | null>(null)

  if (!state) return null
  const target = state.towns.find((town) => town.id === targetId)
  const owned = state.towns.filter((town) => town.ownerId === state.playerId)
  const from = owned.find((town) => town.id === fromId) ?? owned[0]
  if (!target || !from) return null
  const ownTarget = target.ownerId === state.playerId
  const dist = distance(from, target)
  const draft = Object.fromEntries(UNIT_IDS.map((id) => [id, Math.max(0, Math.floor(counts[id] ?? 0))])) as Record<
    (typeof UNIT_IDS)[number],
    number
  >
  if (mission === 'scout') {
    for (const id of UNIT_IDS) if (id !== 'scout') draft[id] = 0
  }
  const trip = mission === 'supply' ? merchantTravelMs(dist) : hasUnits(draft) ? travelMs(dist, draft) : 0
  const weight = siegeWeight(draft)
  const known = ownTarget || target.ownerId === 'wild' || state.reports.some((report) => report.ownerId === state.playerId && report.scout?.townId === target.id && report.scout.buildings)
  const siegeMs = siegeDurationMs({
    hq: known ? target.buildings.headquarters : Math.max(1, Math.round(townPoints(target) / 8)),
    wall: known ? target.buildings.wall : 0,
    points: townPoints(target),
    weight,
  })
  const activeSiege = state.sieges.find((entry) => entry.townId === target.id)

  const submit = () => {
    const result =
      mission === 'supply'
        ? ship(from.id, target.id, cargo)
        : send(from.id, target.id, mission, draft, draft.catapult > 0 ? targetBuilding : null)
    setError(result)
    if (!result) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogTitle className="font-display text-2xl text-brass-2 pr-6">
          {target.name} <span className="num text-base text-brass">{coords(target.x, target.y)}</span>
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted">
          {dist.toFixed(1)} fields from {from.name}. {trip > 0 ? `About ${formatReal(trip / state.speed)} on the road.` : 'Choose what to send.'}
        </DialogDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ['attack', 'Raid'],
              ['siege', 'Besiege'],
              ['relief', 'Relief'],
              ['support', 'Support'],
              ['scout', 'Scout'],
              ['supply', 'Send goods'],
            ] as const
          ).map(([item, label]) => (
            <Button
              key={item}
              size="sm"
              variant={mission === item ? 'default' : 'secondary'}
              onClick={() => onMission(item)}
              disabled={
                ((item === 'attack' || item === 'siege' || item === 'scout') && ownTarget) ||
                ((item === 'support' || item === 'supply') && !ownTarget) ||
                (item === 'relief' && (!activeSiege || activeSiege.attackerOwnerId === state.playerId))
              }
            >
              {label}
            </Button>
          ))}
        </div>
        {mission === 'siege' ? (
          <p className="mt-3 text-xs text-muted">
            Siege weight {weight} (need {SIEGE.minWeight}). A commander counts as {SIEGE.weight.commander}, a catapult {SIEGE.weight.catapult}, a ram {SIEGE.weight.ram}. If this column wins and is still heavy enough, the camp holds for about {formatReal(siegeMs / state.speed)}.
          </p>
        ) : null}
        {mission === 'relief' ? (
          <p className="mt-3 text-xs text-muted">Relief fights the camp in the open. The wall does not help the besiegers.</p>
        ) : null}
        <label className="mt-4 block text-xs text-muted">
          From
          <select className="mt-1 w-full rounded-md border border-line bg-ink px-2 py-2 text-sm text-parchment" value={from.id} onChange={(event) => setFromId(event.target.value)}>
            {owned.map((town) => (
              <option key={town.id} value={town.id}>
                {town.name} ({coords(town.x, town.y)})
              </option>
            ))}
          </select>
        </label>

        {mission === 'supply' ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {(['wood', 'clay', 'iron'] as const).map((key) => (
              <label key={key} className="text-xs capitalize text-muted">
                {key}
                <Input
                  className="mt-1"
                  type="number"
                  min={0}
                  value={cargo[key]}
                  onChange={(event) => setCargo((current) => ({ ...current, [key]: Number(event.target.value) }))}
                />
              </label>
            ))}
          </div>
        ) : (
          <ul className="mt-4 space-y-2">
            {UNIT_IDS.filter((id) => mission !== 'scout' || id === 'scout').map((id) => (
              <li key={id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  {UNITS[id].name} <span className="num text-faint">/ {from.units[id]}</span>
                </span>
                <Input
                  className="w-24"
                  type="number"
                  min={0}
                  max={from.units[id]}
                  value={counts[id] ?? 0}
                  onChange={(event) => setCounts((current) => ({ ...current, [id]: Number(event.target.value) }))}
                />
              </li>
            ))}
          </ul>
        )}

        {mission === 'attack' && (counts.catapult ?? 0) > 0 ? (
          <label className="mt-4 block text-xs text-muted">
            Catapult target
            <select
              className="mt-1 w-full rounded-md border border-line bg-ink px-2 py-2 text-sm"
              value={targetBuilding}
              onChange={(event) => setTargetBuilding(event.target.value as BuildingId)}
            >
              {BUILDING_IDS.map((id) => (
                <option key={id} value={id}>
                  {BUILDINGS[id].name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {error ? <p className="mt-3 text-sm text-blood">{error}</p> : null}
        <div className="mt-5 flex gap-2">
          <Button onClick={submit}>Dispatch</Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
