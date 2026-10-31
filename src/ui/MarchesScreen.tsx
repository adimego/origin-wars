import { UNIT_IDS } from '@/game/config/ids.ts'
import { UNITS } from '@/game/config/units.ts'
import type { Movement } from '@/game/sim/types.ts'
import { formatReal, realLeft } from './format.ts'
import { useGame } from './game-context.tsx'
import { Panel } from './bits.tsx'

export function MarchesScreen() {
  const { state, realNow } = useGame()
  if (!state) return null
  const owned = new Set(state.towns.filter((town) => town.ownerId === state.playerId).map((town) => town.id))
  const outgoing = state.movements.filter((movement) => movement.ownerId === state.playerId)
  const incoming = state.movements.filter(
    (movement) => owned.has(movement.targetTownId) && movement.ownerId !== state.playerId && movement.mission !== 'return',
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl">Marches</h1>
        <p className="mt-1 text-sm text-muted">Travel time is distance times the slowest unit. A returning column uses whoever survived.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Outbound">
          {outgoing.length === 0 ? <p className="text-sm text-muted">No one is on the road.</p> : <List movements={outgoing} />}
        </Panel>
        <Panel title="Inbound">
          {incoming.length === 0 ? (
            <p className="text-sm text-muted">No foreign columns in sight.</p>
          ) : (
            <List movements={incoming} hostile />
          )}
        </Panel>
      </div>
    </div>
  )

  function List({ movements, hostile = false }: { movements: Movement[]; hostile?: boolean }) {
    return (
      <ul className="space-y-3 text-sm">
        {movements.map((movement) => {
          const from = state!.towns.find((town) => town.id === movement.originTownId)
          const to = state!.towns.find((town) => town.id === movement.targetTownId)
          const when = movement.mission === 'trade' && movement.tradeDelivered && movement.returnsAt
            ? movement.returnsAt
            : movement.arrivesAt
          const stack = UNIT_IDS.filter((id) => movement.units[id] > 0)
            .map((id) => `${movement.units[id]} ${UNITS[id].name.toLowerCase()}`)
            .join(', ')
          return (
            <li key={movement.id} className={hostile ? 'text-blood' : ''}>
              <p className="font-medium capitalize">
                {movement.mission} · {from?.name ?? 'Unknown'} → {to?.name ?? 'Unknown'}
              </p>
              <p className="text-muted">
                {stack || (movement.mission === 'trade' ? 'Merchants with goods' : 'Empty carts')} ·{' '}
                {formatReal(realLeft(state!, realNow, when))}
              </p>
            </li>
          )
        })}
      </ul>
    )
  }
}
